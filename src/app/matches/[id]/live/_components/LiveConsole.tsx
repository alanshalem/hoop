'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Coffee, Eye, PencilLine, Play, Table2 } from 'lucide-react';
import { USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import type { Quarter } from '@/core/domain/entities/match.types';
import { isSameTeamFoulPeriod } from '@/core/domain/rules/event-rules';
import { crossesHalftime, formatGameClock, getQuarterLengthSeconds } from '@/core/domain/rules/game-clock';
import { getTimeoutPeriod, isLastTwoMinutesOfFourthQuarter } from '@/core/domain/rules/timeouts';
import type { TeamSide } from '@/core/application/use-cases/match-use-cases';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { selectChartCatalog } from '@/core/application/stores/club-state';
import { useLiveMatchConsole } from '@/core/application/hooks/useLiveMatchConsole';
import type { PeriodEndAction } from '@/core/application/hooks/live-console-rules';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { ScoreboardHeader } from '@/presentation/organisms/ScoreboardHeader/ScoreboardHeader';
import { QUARTER_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import { ChartPad, type ChartPadEntryInput } from '@/presentation/organisms/ChartPad/ChartPad';
import { ChartSheetTable } from '@/presentation/organisms/ChartSheetTable/ChartSheetTable';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import { ConsoleToolbar } from './ConsoleToolbar';
import { OwnFoulPicker } from './OwnFoulPicker';
import {
  REFUSAL_MESSAGES,
  TIMEOUT_PERIOD_LABELS,
  formatTimeouts,
  timeoutWindowLabel,
  type ConsoleRefusal,
} from './live-messages';
import styles from './LiveConsole.module.css';

/** Mobile only: the console alternates between the pad and the sheet view. */
type SheetTab = 'entry' | 'view';

const notifyRefusal = (reason: ConsoleRefusal, title = 'Acción no registrada') =>
  notify({ title, message: REFUSAL_MESSAGES[reason], tone: 'warning' });

/** Courtside console for a match in play: the tactical sheet (Planilla, S15). Mount with `key={matchId}`. */
export function LiveConsole({ matchId }: { matchId: string }) {
  const router = useRouter();
  const players = useClubStore((state) => state.players);
  const chartCatalog = useClubStore(selectChartCatalog);
  const live = useLiveMatchConsole(matchId, { onPeriodEnd: (action) => void handlePeriodEnd(action) });

  const [sheetTab, setSheetTab] = useState<SheetTab>('entry');
  /** The own "Falta" waits for the player who committed it. */
  const [ownFoulPickerOpen, setOwnFoulPickerOpen] = useState(false);

  const { match, teams, clock } = live;
  // Never interrupt a running clock: the tour waits until it is paused (or is replayed explicitly).
  useScreenTour('live', { blocked: clock.isRunning });
  const readOnly = !live.canRecord;

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

  const handleRivalFoul = () => {
    const result = live.recordRivalEvent('FOUL_PERSONAL');
    if (!result.ok) void notifyRefusal(result.reason);
  };

  const handleOwnFoul = (playerId: string) => {
    const result = live.recordOwnFoul(playerId);
    setOwnFoulPickerOpen(false);
    if (!result.ok) void notifyRefusal(result.reason);
  };

  const handleUndoOwnFoul = () => {
    const result = live.undoOwnFoul();
    if (!result.ok) void notifyRefusal(result.reason, 'Nada para deshacer');
  };

  const handleUndoRivalFoul = () => {
    const result = live.undoRivalFoul();
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
        ownName={match.ownTeamName}
        rivalName={match.rivalTeamName}
        readOnly={readOnly}
        recordingLocked={live.isHalftime}
        hasOwnFoul={live.hasOwnFoul}
        ownFoulPickerOpen={ownFoulPickerOpen}
        onOwnFoul={() => setOwnFoulPickerOpen((open) => !open)}
        onUndoOwnFoul={handleUndoOwnFoul}
        hasRivalFoul={live.hasRivalFoul}
        onRivalFoul={handleRivalFoul}
        onUndoRivalFoul={handleUndoRivalFoul}
        onFinish={() => void finishMatchFlow()}
      />

      {ownFoulPickerOpen && !readOnly && !live.isHalftime && (
        <OwnFoulPicker
          players={live.rosterPlayers}
          foulsByPlayer={live.ownFoulsByPlayer}
          onPick={handleOwnFoul}
          onClose={() => setOwnFoulPickerOpen(false)}
        />
      )}

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
              players={live.rosterPlayers}
              events={match.events}
              catalog={chartCatalog}
              rivalRoster={live.rivalRoster}
              readOnly={readOnly}
              locked={live.isHalftime}
              onRecord={handleChartEntry}
              onUndo={handleChartUndo}
            />
          </div>
          <div className={clsx(styles.sheetView, sheetTab !== 'view' && styles.columnHidden)} data-tour="live-chart-sheet">
            <ChartSheetTable
              compact
              events={match.events}
              players={players}
              catalog={chartCatalog}
              rivalPlayers={live.rivalRoster}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
