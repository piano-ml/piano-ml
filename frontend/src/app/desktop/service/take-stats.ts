import type { PracticeTake } from '../../core/api';
import type { LastTake } from './player-control.service';

/**
 * The take figures the coach reads (issue #414), computed once for get_player_state (lastTake) and
 * get_current_session (takes, totals): both tools must report the same accuracy for the same take.
 */

/** notesHit / (notesExpected + notesWrong), null when nothing was assessed. */
export function accuracyOf(notesExpected: number, notesHit: number, notesWrong: number): number | null {
  return notesExpected > 0 ? notesHit / (notesExpected + notesWrong) : null;
}

/** 1 - waits / onsets, null when nothing was assessed. */
export function flowOf(onsets: number, waits: number): number | null {
  return onsets > 0 ? 1 - waits / onsets : null;
}

/** A recorded take as the coach sees it: missing counts as zero, with its accuracy and flow. */
export function lastTakeOf(take: PracticeTake): LastTake {
  const notesExpected = take.notesExpected ?? 0;
  const notesHit = take.notesHit ?? 0;
  const notesWrong = take.notesWrong ?? 0;
  const onsets = take.onsets ?? 0;
  const waits = take.waits ?? 0;
  return {
    startedAt: take.startedAt ?? '',
    measureStart: take.measureStart ?? 0,
    measureEnd: take.measureEnd ?? 0,
    completed: !!take.completed,
    tempoFactor: take.tempoFactor ?? 1,
    hands: take.hands ?? 'listen',
    notesExpected,
    notesHit,
    notesWrong,
    onsets,
    waits,
    accuracy: accuracyOf(notesExpected, notesHit, notesWrong),
    flow: flowOf(onsets, waits),
  };
}
