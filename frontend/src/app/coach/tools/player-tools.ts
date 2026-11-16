import { Injectable, inject } from '@angular/core';
import { PlayerControlService, type Hands, type WorkbenchHandle } from '../../desktop/service/player-control.service';
import { type ToolArgs, ToolError } from './tool';
import { pollUntil, sleep } from './wait';

/** Time for the recorder to publish the take that a stop just ended. */
const AFTER_STOP_MS = 300;

/**
 * The player tools (coach, issue #414): get_player_state, configure_practice, play, stop, wait_for_take_end,
 * get_current_session. They act through the workbench's remote control only.
 */
@Injectable({ providedIn: 'root' })
export class PlayerTools {
  private readonly control = inject(PlayerControlService);

  getPlayerState(): unknown {
    return this.control.state();
  }

  async configurePractice(args: ToolArgs): Promise<unknown> {
    const handle = this.readyHandle();
    const has = (name: string) => args[name] != null;
    if (has('wholeScore') && (has('fromMeasure') || has('toMeasure'))) {
      throw new ToolError('INVALID_ARGUMENT', 'Give either wholeScore or fromMeasure/toMeasure, not both.');
    }
    if (has('tempoPercent') && has('tempoBpm')) {
      throw new ToolError('INVALID_ARGUMENT', 'Give either tempoPercent or tempoBpm, not both.');
    }
    let state = this.control.state();
    const changesRange = has('fromMeasure') || has('toMeasure') || args['wholeScore'] === true;
    let from = state.range.fromMeasure;
    let to = state.range.toMeasure;
    if (has('fromMeasure') || has('toMeasure')) {
      from = has('fromMeasure') ? Number(args['fromMeasure']) : from;
      to = has('toMeasure') ? Number(args['toMeasure']) : to;
      if (from < 1 || from > to || to > state.measureTotal) {
        throw new ToolError('INVALID_RANGE',
          `The range must be within measures 1 to ${state.measureTotal}, fromMeasure not after toMeasure.`);
      }
    }

    let stoppedPlayback = false;
    if (state.playing && (changesRange || has('loop'))) {
      handle.stop();
      stoppedPlayback = true;
    }
    if (args['wholeScore'] === true) {
      handle.setWholeScore();
    } else if (has('fromMeasure') || has('toMeasure')) {
      handle.setRange(from, to);
    }
    if (has('tempoPercent')) {
      state = this.control.state();
      handle.setTempoBpm(Math.round((state.tempo.originalBpm * Number(args['tempoPercent'])) / 100));
    } else if (has('tempoBpm')) {
      handle.setTempoBpm(Number(args['tempoBpm']));
    }
    if (has('loop')) handle.setLoop(args['loop'] === true);
    if (has('hands')) handle.setHands(args['hands'] as Hands);
    if (has('metronome')) handle.setMetronome(args['metronome'] === true);
    if (has('showKeyboard')) handle.setKeyboardVisible(args['showKeyboard'] === true);
    return stoppedPlayback ? { ...this.control.state(), stoppedPlayback } : this.control.state();
  }

  async play(args: ToolArgs): Promise<unknown> {
    const handle = this.readyHandle();
    const state = this.control.state();
    if (!state.audioUnlocked) {
      throw new ToolError('AUDIO_LOCKED',
        'The browser needs one click from the student before sound can start. Ask them to press Start playback in the PianoML tab, then call play again.');
    }
    const restart = args['restart'] === true;
    if (state.playing && !restart) {
      return state;
    }
    await handle.play(restart);
    return this.control.state();
  }

  async stop(): Promise<unknown> {
    this.readyHandle().stop();
    await sleep(AFTER_STOP_MS);
    return this.control.state();
  }

  async waitForTakeEnd(args: ToolArgs): Promise<unknown> {
    const timeoutMs = (args['timeoutSeconds'] == null ? 30 : Number(args['timeoutSeconds'])) * 1000;
    const start = this.control.state();
    if (!start.playing) {
      return { ended: true, state: start };
    }
    const before = JSON.stringify(start.lastTake);
    const ended = await pollUntil(() => {
      const now = this.control.state();
      return !now.playing || JSON.stringify(now.lastTake) !== before;
    }, timeoutMs);
    return { ended, state: this.control.state() };
  }

  getCurrentSession(): unknown {
    return { session: this.control.currentSession() };
  }

  private readyHandle(): WorkbenchHandle {
    const handle = this.control.handle();
    if (!handle || !handle.isReady()) {
      throw new ToolError('NO_SCORE_LOADED', 'No score or exercise is open. Use open_score or open_exercise first.');
    }
    return handle;
  }
}
