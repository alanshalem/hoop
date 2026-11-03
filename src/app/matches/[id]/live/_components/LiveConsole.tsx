'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { BarChart3, ClipboardList, Coffee, Crosshair, Eye, PencilLine, Play, Table2, Users, Zap } from 'lucide-react';
import { USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import type { PlayByPlayEventType, Quarter } from '@/core/domain/entities/match.types';
import type { CourtCoordinates } from '@/core/domain/value-objects/coordinates';
import { isSameTeamFoulPeriod } from '@/core/domain/rules/event-rules';
import { crossesHalftime, formatGameClock, getQuarterLengthSeconds } from '@/core/domain/rules/game-clock';
import { getTimeoutPeriod, isLastTwoMinutesOfFourthQuarter } from '@/core/domain/rules/timeouts';
import type { TeamSide } from '@/core/application/use-cases/match-use-cases';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { useLiveMatchConsole } from '@/core/application/hooks/useLiveMatchConsole';
import type { PeriodEndAction } from '@/core/application/hooks/live-console-rules';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { ScoreboardHeader } from '@/presentation/organisms/ScoreboardHeader/ScoreboardHeader';
import { QUARTER_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import {
  EMPTY_SUBSTITUTION,
  OnCourtLineup,
  type SubstitutionDraft,
} from '@/presentation/organisms/OnCourtLineup/OnCourtLineup';
import { HalfCourtShotChart } from '@/presentation/organisms/HalfCourtShotChart/HalfCourtShotChart';
import { QuickActionPad } from '@/presentation/organisms/QuickActionPad/QuickActionPad';
import { ChartPad, type ChartPadEntryInput } from '@/presentation/organisms/ChartPad/ChartPad';
import { ChartSheetTable } from '@/presentation/organisms/ChartSheetTable/ChartSheetTable';
import { PlayByPlayTimeline } from '@/presentation/organisms/PlayByPlayTimeline/PlayByPlayTimeline';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import { ConsoleToolbar } from './ConsoleToolbar';
import {
  REFUSAL_MESSAGES,
  TIMEOUT_PERIOD_LABELS,
  formatTimeouts,
  timeoutWindowLabel,
  type ConsoleRefusal,
} from './live-messages';
import styles from './LiveConsole.module.css';

type MobileTab = 'lineup' | 'chart' | 'pad';
/** The tactical sheet (Planilla) is the core of the console; stats are secondary. */
type ConsoleMode = 'sheet' | 'stats';
/** Mobile only: the sheet mode alternates between the pad and the sheet view. */
type SheetTab = 'entry' | 'view';

const MOBILE_QUERY = '(max-width: 899px)';

const shotType = (is3pt: boolean, isMade: boolean): PlayByPlayEventType => {
  if (is3pt) return isMade ? 'FG3_MADE' : 'FG3_MISS';
  return isMade ? 'FG2_MADE' : 'FG2_MISS';
};

const notifyRefusal = (reason: ConsoleRefusal, title = 'Acción no registrada') =>
  notify({ title, message: REFUSAL_MESSAGES[reason], tone: 'warning' });

/** Courtside console for a match in play. Mount with `key={matchId}`. */
export function LiveConsole({ matchId }: { matchId: string }) {
  const router = useRouter();
  const players = useClubStore((state) => state.players);
  const live = useLiveMatchConsole(matchId, { onPeriodEnd: (action) => void handlePeriodEnd(action) });

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [substitution, setSubstitution] = useState<SubstitutionDraft | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chart');
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('sheet');
  const [sheetTab, setSheetTab] = useState<SheetTab>('entry');

  const { match, teams, clock } = live;
  // Never interrupt a running clock: the tour waits until it is paused (or is replayed explicitly).
  useScreenTour('live', { blocked: clock.isRunning });
  const readOnly = !live.canRecord;
  // FIBA halftime: no plays and no timeouts until the 3rd quarter starts.
  const recordingLocked = readOnly || live.isHalftime;
  // Only on-court players record actions; a substituted player drops the selection.
  const selectedPlayer = live.onCourtPlayers.find((p) => p.id === selectedPlayerId) ?? null;

  async function finishMatchFlow(intro = '') {
    if (!teams) return;
    const accepted = await confirm({
      title: 'Finalizar partido',
      message: `${intro}Resultado final: ${teams.own.name} ${teams.own.score} - ${teams.rival.score} ${teams.rival.name}. El partido pasa a Finalizado y no se podrán registrar más jugadas.`,
      confirmLabel: 'Finalizar partido',
      tone: 'danger',
    });
    if (!accepted) return;
    const result = live.finish();
    if (!result.ok) {
      void notifyRefusal(result.reason, 'No se pudo finalizar');
      return;
    }
    router.push(`/matches/${matchId}/stats`);
  }

  async function handlePeriodEnd(action: PeriodEndAction) {
    if (action.kind === 'HALFTIME') {
      const accepted = await confirm({
        title: 'Fin de la primera mitad',
        message: 'El reloj llegó a 00:00. ¿Pasar al entretiempo? No se registran jugadas ni tiempos muertos hasta comenzar el 3.er cuarto.',
        confirmLabel: 'Ir al entretiempo',
        tone: 'info',
      });
      if (!accepted) return;
      const result = live.startHalftime();
      if (!result.ok) void notifyRefusal(result.reason, 'No se pudo pasar al entretiempo');
      return;
    }
    if (action.kind === 'FINISH') {
      await finishMatchFlow('El reloj llegó a 00:00. ');
      return;
    }
    if (action.kind === 'NONE') {
      void notify({
        title: 'Fin del período',
        message: 'El reloj llegó a 00:00 con el marcador empatado y no hay más suplementarios disponibles. Ajusta el marcador o finaliza el partido.',
        tone: 'info',
      });
      return;
    }
    const accepted = await confirm({
      title: 'Fin del período',
      message: `El reloj llegó a 00:00. ¿Pasar al ${QUARTER_LABELS[action.next]}? El reloj se reinicia a ${formatGameClock(getQuarterLengthSeconds(action.next))}.`,
      confirmLabel: `Ir al ${QUARTER_LABELS[action.next]}`,
      tone: 'info',
    });
    if (accepted) live.changeQuarter(action.next);
  }

  if (!match || !teams) return null;

  const recordForSelected = (type: PlayByPlayEventType, coordinates?: CourtCoordinates) => {
    if (!selectedPlayer) return;
    const result = live.recordPlayerEvent(selectedPlayer.id, type, coordinates);
    if (!result.ok) void notifyRefusal(result.reason);
  };

  const handleRivalAction = (type: PlayByPlayEventType) => {
    const result = live.recordRivalEvent(type);
    if (!result.ok) void notifyRefusal(result.reason);
  };

  const handleUndo = () => {
    const result = live.undo();
    if (!result.ok) void notifyRefusal(result.reason, 'Nada para deshacer');
  };

  const handleChartEntry = (input: ChartPadEntryInput): boolean => {
    const result = live.recordChartEntry(input);
    if (!result.ok) void notifyRefusal(result.reason, 'Entrada no registrada');
    return result.ok;
  };

  const handleChartUndo = () => {
    const result = live.undoChartEntry();
    if (!result.ok) void notifyRefusal(result.reason, 'Nada para deshacer');
  };

  const statEvents = match.events.filter((event) => event.type !== 'CHART');

  const handleSelectPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId);
    if (window.matchMedia(MOBILE_QUERY).matches) setMobileTab('pad');
  };

  const handleSubstitute = (playerOutId: string, playerInId: string) => {
    const result = live.substitute(playerOutId, playerInId);
    if (!result.ok) {
      setSubstitution({ playerOutId, playerInId: null });
      void notifyRefusal(result.reason, 'Cambio no realizado');
      return;
    }
    setSubstitution(null);
    if (selectedPlayerId === playerOutId) setSelectedPlayerId(playerInId);
  };

  const handleRequestSub = () => {
    setSubstitution({ ...EMPTY_SUBSTITUTION, playerOutId: selectedPlayer?.id ?? null });
    setMobileTab('lineup');
  };

  const handleTimeout = async (side: TeamSide) => {
    const team = side === 'OWN' ? teams.own : teams.rival;
    const period = TIMEOUT_PERIOD_LABELS[getTimeoutPeriod(match.currentQuarter)];
    const lastTwoMinutes = isLastTwoMinutesOfFourthQuarter(match.currentQuarter, clock.read());
    const lastTwoMinutesNote = lastTwoMinutes
      ? ' En los últimos 2 minutos del 4.º cuarto cada equipo puede usar como máximo 2 (FIBA).'
      : '';
    if (team.timeoutsLeft > 0) {
      const accepted = await confirm({
        title: 'Tiempo muerto',
        message: `¿Tiempo muerto para ${team.name}? El reloj se detiene. Le quedan ${formatTimeouts(team.timeoutsLeft)} en ${timeoutWindowLabel(match.currentQuarter, clock.read())}.${lastTwoMinutesNote}`,
        confirmLabel: 'Pedir tiempo muerto',
        tone: 'info',
      });
      if (!accepted) return;
    }
    const timeoutWindow = timeoutWindowLabel(match.currentQuarter, clock.read());
    const result = live.callTimeout(side);
    if (result.ok) {
      void notify({
        title: `Tiempo muerto: ${team.name}`,
        message: `Reloj detenido. A ${team.name} le quedan ${formatTimeouts(result.remaining)} en ${timeoutWindow}.`,
        tone: 'info',
      });
    } else if (result.reason === 'NO_TIMEOUTS_LEFT') {
      void notify({
        title: 'Sin tiempos muertos',
        message: lastTwoMinutes
          ? `${team.name} ya no tiene tiempos muertos: en los últimos 2 minutos del 4.º cuarto se pueden usar como máximo 2 (FIBA).`
          : `${team.name} ya usó todos sus tiempos muertos de ${period}.`,
        tone: 'warning',
      });
    } else if (result.reason === 'HALFTIME') {
      void notify({
        title: 'Sin tiempos muertos en el entretiempo',
        message: 'FIBA no permite tiempos muertos durante el entretiempo. Comienza el 3.er cuarto para pedirlos.',
        tone: 'warning',
      });
    } else {
      void notifyRefusal(result.reason, 'Tiempo muerto no registrado');
    }
  };

  const handleSelectQuarter = async (quarter: Quarter) => {
    if (quarter === match.currentQuarter) return;
    // Any jump out of the first half stops at halftime first (the use case enforces it).
    if (crossesHalftime(match.currentQuarter, quarter)) {
      const accepted = await confirm({
        title: 'Fin de la primera mitad',
        message: 'El partido pasa al entretiempo: no se registran jugadas ni tiempos muertos hasta comenzar el 3.er cuarto.',
        confirmLabel: 'Ir al entretiempo',
        tone: 'warning',
      });
      if (accepted) live.changeQuarter(quarter);
      return;
    }
    const foulNote = isSameTeamFoulPeriod(match.currentQuarter, quarter)
      ? 'Las faltas de equipo se mantienen: los suplementarios cuentan como el 4.º cuarto.'
      : 'Las faltas de equipo vuelven a cero para el nuevo período.';
    const accepted = await confirm({
      title: `Cambiar al ${QUARTER_LABELS[quarter]}`,
      message: `El reloj se reinicia a ${formatGameClock(getQuarterLengthSeconds(quarter))}. ${foulNote}`,
      confirmLabel: 'Cambiar período',
      tone: 'warning',
    });
    if (accepted) live.changeQuarter(quarter);
  };

  const handleStartThirdQuarter = () => {
    const result = live.startThirdQuarter();
    if (!result.ok) void notifyRefusal(result.reason, 'No se pudo comenzar el 3.er cuarto');
  };

  const mobileTabs: Array<{ value: MobileTab; label: string; icon: React.ReactNode }> = [
    { value: 'lineup', label: `Quinteto (${live.onCourtPlayers.length})`, icon: <Users size={ICON_SIZE.sm} /> },
    { value: 'chart', label: 'Cancha', icon: <Crosshair size={ICON_SIZE.sm} /> },
    { value: 'pad', label: 'Acciones', icon: <Zap size={ICON_SIZE.sm} /> },
  ];

  const sheetTabs: Array<{ value: SheetTab; label: string; icon: React.ReactNode }> = [
    { value: 'entry', label: 'Cargar', icon: <PencilLine size={ICON_SIZE.sm} /> },
    { value: 'view', label: 'Ver planilla', icon: <Table2 size={ICON_SIZE.sm} /> },
  ];

  return (
    <div className={styles.liveViewport}>
      <ScoreboardHeader
        home={teams.home}
        away={teams.away}
        quarter={match.currentQuarter}
        quarters={live.quarters}
        clockSeconds={clock.seconds}
        isClockRunning={clock.isRunning}
        readOnly={readOnly}
        isHalftime={live.isHalftime}
        onSelectQuarter={(quarter) => void handleSelectQuarter(quarter)}
        onToggleClock={clock.toggle}
        onAdjustClock={(delta) => clock.set(clock.read() + delta)}
        onTimeout={(side) => void handleTimeout(side)}
      />

      <ConsoleToolbar
        matchId={match.id}
        rivalName={match.rivalTeamName}
        readOnly={readOnly}
        recordingLocked={live.isHalftime}
        onRivalAction={handleRivalAction}
        onFinish={() => void finishMatchFlow()}
      />

      {live.isHalftime && (
        <div className={styles.halftimeBanner} role="status">
          <Coffee size={ICON_SIZE.md} aria-hidden="true" />
          <p className={styles.halftimeText}>
            <strong>Entretiempo.</strong> No se registran jugadas ni tiempos muertos (FIBA) hasta comenzar el 3.er cuarto.
          </p>
          {!readOnly && (
            <TouchButton
              size="lg"
              leftIcon={<Play size={ICON_SIZE.md} />}
              className={styles.halftimeAction}
              onClick={handleStartThirdQuarter}
            >
              Comenzar 3.er cuarto
            </TouchButton>
          )}
        </div>
      )}

      {readOnly && (
        <p className={styles.readOnlyBanner} role="status">
          <Eye size={ICON_SIZE.md} aria-hidden="true" />
          Modo lectura: el rol {USER_ROLE_LABELS[live.role]} no tiene permiso para registrar el partido en vivo.
        </p>
      )}

      <div className={styles.modeSwitch} role="tablist" aria-label="Modo de la consola" data-tour="live-mode">
        <button
          type="button"
          role="tab"
          aria-selected={consoleMode === 'sheet'}
          className={clsx(styles.modeBtn, consoleMode === 'sheet' && styles.modeActive)}
          onClick={() => setConsoleMode('sheet')}
        >
          <ClipboardList size={ICON_SIZE.sm} aria-hidden="true" />
          Planilla
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={consoleMode === 'stats'}
          className={clsx(styles.modeBtn, consoleMode === 'stats' && styles.modeActive)}
          onClick={() => setConsoleMode('stats')}
        >
          <BarChart3 size={ICON_SIZE.sm} aria-hidden="true" />
          Estadística
        </button>
      </div>

      {consoleMode === 'sheet' && (
        <div className={styles.sheetConsole}>
          <div className={styles.mobileTabs} role="tablist" aria-label="Secciones de la planilla">
            {sheetTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={sheetTab === tab.value}
                className={clsx(styles.mobileTabBtn, sheetTab === tab.value && styles.mobileTabActive)}
                onClick={() => setSheetTab(tab.value)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.sheetBody}>
            <div className={clsx(styles.sheetPadSlot, sheetTab !== 'entry' && styles.columnHidden)}>
              <ChartPad
                className={styles.sheetPad}
                onCourtPlayers={live.onCourtPlayers}
                benchPlayers={live.benchPlayers}
                events={match.events}
                readOnly={readOnly}
                locked={live.isHalftime}
                onRecord={handleChartEntry}
                onUndo={handleChartUndo}
              />
            </div>
            <div className={clsx(styles.sheetView, sheetTab !== 'view' && styles.columnHidden)} data-tour="live-chart-sheet">
              <ChartSheetTable compact events={match.events} players={players} />
            </div>
          </div>
        </div>
      )}

      {consoleMode === 'stats' && (
      <>
      <div className={styles.mobileTabs} role="tablist" aria-label="Secciones de la consola" data-tour="live-tabs">
        {mobileTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab.value}
            className={clsx(styles.mobileTabBtn, mobileTab === tab.value && styles.mobileTabActive)}
            onClick={() => setMobileTab(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.mainConsole}>
        <div className={clsx(styles.columnSection, mobileTab !== 'lineup' && styles.columnHidden)}>
          <OnCourtLineup
            onCourtPlayers={live.onCourtPlayers}
            benchPlayers={live.benchPlayers}
            playerLines={live.playerLines}
            fouledOutIds={live.fouledOutIds}
            selectedPlayerId={selectedPlayer?.id ?? null}
            substitution={substitution}
            readOnly={recordingLocked}
            onSelectPlayer={handleSelectPlayer}
            onSubstitutionChange={setSubstitution}
            onSubstitute={handleSubstitute}
          />
        </div>

        <div className={clsx(styles.columnSection, styles.centerColumn, mobileTab !== 'chart' && styles.columnHidden)}>
          <HalfCourtShotChart
            className={styles.court}
            data-tour="live-court"
            events={match.events}
            selectedPlayer={selectedPlayer}
            readOnly={recordingLocked}
            onRecordShot={(coordinates, is3pt, isMade) => recordForSelected(shotType(is3pt, isMade), coordinates)}
          />
          <PlayByPlayTimeline
            className={styles.timeline}
            events={statEvents}
            players={players}
            rivalName={match.rivalTeamName}
            limit={6}
            readOnly={recordingLocked}
            onUndo={handleUndo}
          />
        </div>

        <div className={clsx(styles.columnSection, mobileTab !== 'pad' && styles.columnHidden)}>
          <QuickActionPad
            selectedPlayer={selectedPlayer}
            playerFouls={selectedPlayer ? live.playerLines[selectedPlayer.id]?.fouls ?? 0 : 0}
            readOnly={recordingLocked}
            onRecordAction={(type) => recordForSelected(type)}
            onRequestSub={handleRequestSub}
          />
        </div>
      </div>
      </>
      )}
    </div>
  );
}
