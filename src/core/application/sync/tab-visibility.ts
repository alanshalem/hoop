import type { TimerPort, VisibilityPort } from './sync-engine';
import { parseTabMessage, TAB_PROTOCOL_VERSION, type TabChannelPort } from './tab-coordinator';

/**
 * =============================================================================
 * HOOP - PAGE VISIBILITY OF EVERY TAB (S4, L8)
 * Only the leader tab polls, but it must keep polling while ANY tab of this
 * browser is on screen, not only its own. Each tab announces its visibility on
 * the tab channel, again every VISIBILITY_HEARTBEAT_MS while visible and when a
 * new leader announces itself; a tab that stops announcing (closed or frozen
 * without saying so) counts as hidden after VISIBILITY_TTL_MS.
 * As the engine's VisibilityPort it is visible while this tab or another one
 * is, reports `true` whenever one of them comes on screen (the engine pulls at
 * once) and `false` once none is (polling pauses).
 * =============================================================================
 */

export const VISIBILITY_HEARTBEAT_MS = 5_000;
export const VISIBILITY_TTL_MS = 3 * VISIBILITY_HEARTBEAT_MS;

export interface TabsVisibility extends VisibilityPort {
  /** Starts announcing this tab and listening to the others. */
  start(): void;
  /** Announces this tab as hidden and forgets the others. */
  stop(): void;
}

export interface TabsVisibilityDeps {
  /** This page (Page Visibility API). */
  local: VisibilityPort;
  /** Null without BroadcastChannel: only this page counts. */
  channel: TabChannelPort | null;
  tabId: string;
  timers?: TimerPort;
}

const defaultTimers: TimerPort = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createTabsVisibility({ local, channel, tabId, timers = defaultTimers }: TabsVisibilityDeps): TabsVisibility {
  const listeners = new Set<(visible: boolean) => void>();
  /** Other tabs on screen, each with the timer that forgets it. */
  const visibleTabs = new Map<string, unknown>();
  let started = false;
  let cleanups: (() => void)[] = [];
  let heartbeat: unknown = null;

  const isVisible = () => local.isVisible() || visibleTabs.size > 0;
  const emit = (visible: boolean) => listeners.forEach((listener) => listener(visible));
  const announce = (visible: boolean) => channel?.post({ v: TAB_PROTOCOL_VERSION, type: 'visibility', tabId, visible });

  function stopHeartbeat(): void {
    if (heartbeat !== null) timers.clearTimeout(heartbeat);
    heartbeat = null;
  }

  function beat(): void {
    if (!channel) return;
    announce(true);
    heartbeat = timers.setTimeout(beat, VISIBILITY_HEARTBEAT_MS);
  }

  function onLocal(visible: boolean): void {
    stopHeartbeat();
    if (visible) {
      beat();
      emit(true);
      return;
    }
    announce(false);
    if (!isVisible()) emit(false);
  }

  /** False when the tab was not counted as visible. */
  function forget(id: string): boolean {
    if (!visibleTabs.has(id)) return false;
    timers.clearTimeout(visibleTabs.get(id));
    visibleTabs.delete(id);
    return true;
  }

  function onOtherTab(id: string, visible: boolean): void {
    const wasVisible = forget(id);
    if (!visible) {
      if (wasVisible && !isVisible()) emit(false);
      return;
    }
    visibleTabs.set(
      id,
      timers.setTimeout(() => {
        visibleTabs.delete(id);
        if (!isVisible()) emit(false);
      }, VISIBILITY_TTL_MS)
    );
    if (!wasVisible) emit(true);
  }

  function onMessage(raw: unknown): void {
    const message = parseTabMessage(raw);
    if (message?.type === 'visibility' && message.tabId !== tabId) onOtherTab(message.tabId, message.visible);
    // A new leader learns at once which tabs are on screen.
    else if (message?.type === 'leader' && local.isVisible()) announce(true);
  }

  return {
    isVisible,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (started) return;
      started = true;
      cleanups = [local.subscribe(onLocal)];
      if (channel) cleanups.push(channel.subscribe(onMessage));
      if (local.isVisible()) beat();
    },

    stop() {
      if (!started) return;
      started = false;
      cleanups.forEach((cleanup) => cleanup());
      cleanups = [];
      if (heartbeat !== null) announce(false);
      stopHeartbeat();
      for (const id of [...visibleTabs.keys()]) forget(id);
    },
  };
}
