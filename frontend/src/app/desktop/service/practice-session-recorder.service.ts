import { Injectable, Injector, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { PracticeMeasure, PracticeService, PracticeSessionApiInfo, PracticeTake } from '../../core/api';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { XSRF_API_BASE, XSRF_COOKIE_NAME, XSRF_HEADER_NAME, readCookie } from '../../account/interceptors/xsrf.interceptor';
import type { PlayConfiguration } from '../model/model';
import { AssessCounters, AssessSnapshot, PlayerAssessService } from './player-assess.service';

/** What is on the music stand: a library score, or an exercise identified by its stable keys. */
export type PracticeItem =
  | { kind: 'score'; scoreId: string; title?: string }
  | {
    kind: 'exercise';
    exerciseType: 'scale' | 'agility';
    /** Stable key of the scale or chord (never its translated name). */
    patternKey: string;
    exerciseKey: string;
    tonic: string;
    mode?: string;
    title?: string;
  };

export type FlushReason = PracticeSessionApiInfo.EndReasonEnum | 'checkpoint';

/** The clock stops after this long without a note, played or due: the user walked away. */
export const IDLE_CUTOFF_MS = 30_000;
/** A Play after this long without one starts a new session. */
export const SESSION_IDLE_MS = 5 * 60_000;
/** Sessions shorter than this are not worth recording. */
export const MIN_ACTIVE_SECONDS = 10;
/** While playing, the session is saved this often: a crash or a dead battery loses little. */
export const CHECKPOINT_MS = 30_000;
export const OUTBOX_KEY = 'practiceOutbox';
const OUTBOX_MAX_ENTRIES = 20;
/** The backend refuses older sessions. */
const OUTBOX_MAX_AGE_MS = 7 * 24 * 3600_000;
const MAX_TAKES = 500;

interface OpenTake {
  startedAt: number;
  lastActivityAt: number;
  activeMs: number;
  measureStart: number;
  measureEnd: number;
  hands: PracticeSessionApiInfo.HandsEnum;
  tempoFactor: number;
}

interface Session {
  id: string;
  item: PracticeItem;
  startedAt: number;
  lastEventAt: number;
  activeMs: number;
  takeCount: number;
  completedCount: number;
  takes: PracticeTake[];
  totals: AssessCounters;
  measures: Map<number, AssessCounters>;
  measureStart?: number;
  measureEnd?: number;
  measureTotal?: number;
  hands?: PracticeSessionApiInfo.HandsEnum;
  tempoFactor?: number;
  metronome?: boolean;
  loop?: boolean;
  midiInput: boolean;
}

interface OutboxEntry {
  userId: string;
  savedAt: number;
  session: PracticeSessionApiInfo;
}

const emptyCounters = (): AssessCounters => ({ expected: 0, hit: 0, wrong: 0, onsets: 0, waits: 0 });

function addCounters(into: AssessCounters, from: AssessCounters): void {
  into.expected += from.expected;
  into.hit += from.hit;
  into.wrong += from.wrong;
  into.onsets += from.onsets;
  into.waits += from.waits;
}

const toApiCounters = (c: AssessCounters) => ({
  notesExpected: c.expected, notesHit: c.hit, notesWrong: c.wrong, onsets: c.onsets, waits: c.waits,
});

/**
 * Records what a logged-in user practices in the workbench (issue #399).
 *
 * Notes are never sent one by one: the assessment counters of each take (Play to Stop, or to the end of the
 * range) are merged into the session, and the whole session is sent again, under the id it was given here, each
 * time it changes: at the end of a take, every 30 s while playing, when the workbench is left and when the page
 * is hidden or unloaded. A copy waits in localStorage until the server has it, so offline play and killed tabs
 * are sent on the next visit.
 *
 * Anonymous users are not recorded.
 */
@Injectable({ providedIn: 'root' })
export class PracticeSessionRecorder implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly assess = inject(PlayerAssessService);
  private readonly sessionStorage = inject(SessionStorageService);
  private readonly apiBase = inject(XSRF_API_BASE);

  private item: PracticeItem | null = null;
  private measureTotal: number | undefined;
  private session: Session | null = null;
  private take: OpenTake | null = null;
  private checkpointTimer?: ReturnType<typeof setInterval>;

  private readonly onVisibilityChange = () => {
    if (this.document.visibilityState === 'hidden') {
      this.flush('checkpoint', true);
    }
  };
  private readonly onPageHide = () => this.flush('unloaded', true);

  constructor() {
    if (this.isBrowser) {
      // Not beforeunload/unload: unreliable on mobile, and they disable the back/forward cache.
      this.document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('pagehide', this.onPageHide);
      this.replayOutbox();
    }
  }

  /** The score or exercise now loaded in the workbench; ends the session on the previous one. */
  setItem(item: PracticeItem | null, measureTotal?: number): void {
    this.endSession('left');
    this.item = item;
    this.measureTotal = measureTotal;
  }

  /** Play was pressed (or a loop starts its next pass). */
  takeStarted(config: PlayConfiguration): void {
    if (!this.isBrowser || !this.item) {
      return;
    }
    this.takeEnded(false);
    const now = this.now();
    if (this.session && now - this.session.lastEventAt > SESSION_IDLE_MS) {
      this.endSession('idle');
    }
    if (!this.session) {
      this.session = {
        id: crypto.randomUUID(),
        item: this.item,
        startedAt: now,
        lastEventAt: now,
        activeMs: 0,
        takeCount: 0,
        completedCount: 0,
        takes: [],
        totals: emptyCounters(),
        measures: new Map(),
        measureTotal: this.measureTotal,
        midiInput: false,
      };
    }
    // scoreRange is 0-based with an exclusive end, and can run one past the last measure
    const measureStart = config.scoreRange[0] + 1;
    const lastMeasure = this.measureTotal && this.measureTotal > 0 ? this.measureTotal : config.scoreRange[1];
    this.take = {
      startedAt: now,
      lastActivityAt: now,
      activeMs: 0,
      measureStart,
      measureEnd: Math.max(measureStart, Math.min(config.scoreRange[1], lastMeasure)),
      hands: config.waitForLeftHand && config.waitForRightHand ? 'both'
        : config.waitForLeftHand ? 'left'
          : config.waitForRightHand ? 'right' : 'listen',
      tempoFactor: config.tempoFactor,
    };
    this.session.metronome = config.useMetronome;
    this.session.loop = config.isLoop;
    this.checkpointTimer ??= setInterval(() => this.flush('checkpoint'), CHECKPOINT_MS);
  }

  /** The score moved on (a note became due): the user is there. */
  activity(): void {
    const take = this.take;
    if (!take) {
      return;
    }
    const now = this.now();
    take.activeMs += Math.min(now - take.lastActivityAt, IDLE_CUTOFF_MS);
    take.lastActivityAt = now;
  }

  /** The user played a note on a MIDI keyboard. */
  noteOn(): void {
    if (this.take && this.session) {
      this.session.midiInput = true;
      this.activity();
    }
  }

  /**
   * The take is over: Stop, or the end of the range ({@code completed}). Must be called before the assessment
   * is reset, as it reads its counters. Does nothing when no take is open.
   */
  takeEnded(completed: boolean): void {
    const take = this.take;
    const session = this.session;
    if (!take || !session) {
      return;
    }
    this.activity();
    const snapshot = this.assess.snapshot();
    this.take = null;
    this.stopCheckpoints();

    session.lastEventAt = this.now();
    session.activeMs += take.activeMs;
    session.takeCount += 1;
    if (completed) {
      session.completedCount += 1;
    }
    this.mergeTake(session, take, snapshot);
    if (session.takes.length < MAX_TAKES) {
      session.takes.push(this.toApiTake(take, take.activeMs, snapshot, completed));
    }
    this.flush(completed ? 'ended' : 'stopped');
  }

  /** The workbench is left, or another score is loaded. */
  endSession(reason: PracticeSessionApiInfo.EndReasonEnum = 'left'): void {
    if (this.take) {
      this.takeEnded(false);
    }
    if (this.session) {
      this.flush(reason);
    }
    this.session = null;
    this.stopCheckpoints();
  }

  /**
   * Sends the session as it stands. {@code keepalive} is for a page that is going away: the request survives
   * the page, which an XHR does not.
   */
  flush(reason: FlushReason, keepalive = false): void {
    const userId = this.sessionStorage.getUserId();
    const session = this.session;
    if (!this.isBrowser || !session || !userId) {
      return;
    }
    const payload = this.toApiSession(session, reason);
    if (payload.activeSeconds < MIN_ACTIVE_SECONDS) {
      return;
    }
    this.writeOutbox(session.id, { userId, savedAt: this.now(), session: payload });
    this.send(session.id, payload, keepalive);
  }

  /** Sends what a previous visit could not: offline play, a tab closed before the request left. */
  replayOutbox(): void {
    const userId = this.sessionStorage.getUserId();
    if (!this.isBrowser || !userId) {
      return;
    }
    const outbox = this.readOutbox();
    const now = this.now();
    for (const [id, entry] of Object.entries(outbox)) {
      if (now - entry.savedAt > OUTBOX_MAX_AGE_MS) {
        this.removeFromOutbox(id);
      } else if (entry.userId === userId && id !== this.session?.id) {
        this.send(id, entry.session, false);
      }
    }
  }

  ngOnDestroy(): void {
    this.endSession('left');
    if (this.isBrowser) {
      this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('pagehide', this.onPageHide);
    }
  }

  /** Wall clock in milliseconds; a method so that specs can drive time. */
  protected now(): number {
    return Date.now();
  }

  // --- building the payload ----------------------------------------------------------------------------------

  private mergeTake(session: Session, take: OpenTake, snapshot: AssessSnapshot): void {
    addCounters(session.totals, snapshot);
    for (const measure of snapshot.measures) {
      let counters = session.measures.get(measure.measure);
      if (!counters) {
        counters = emptyCounters();
        session.measures.set(measure.measure, counters);
      }
      addCounters(counters, measure);
    }
    session.measureStart = Math.min(session.measureStart ?? take.measureStart, take.measureStart);
    session.measureEnd = Math.max(session.measureEnd ?? take.measureEnd, take.measureEnd);
    session.hands = take.hands;
    session.tempoFactor = take.tempoFactor;
  }

  private toApiTake(take: OpenTake, activeMs: number, snapshot: AssessCounters, completed: boolean): PracticeTake {
    return {
      startedAt: new Date(take.startedAt).toISOString(),
      activeSeconds: Math.round(activeMs / 1000),
      measureStart: take.measureStart,
      measureEnd: take.measureEnd,
      hands: take.hands,
      tempoFactor: take.tempoFactor,
      completed,
      ...toApiCounters(snapshot),
    };
  }

  /** The session with its closed takes, plus the take in progress as it stands now. */
  private toApiSession(closed: Session, reason: FlushReason): PracticeSessionApiInfo {
    let session = closed;
    let endedAt = closed.lastEventAt;
    const take = this.take;
    if (take) {
      // Work on a copy: the open take is merged again, with fresh counters, at the next flush
      const now = this.now();
      const activeMs = take.activeMs + Math.min(now - take.lastActivityAt, IDLE_CUTOFF_MS);
      const snapshot = this.assess.snapshot();
      session = {
        ...closed,
        activeMs: closed.activeMs + activeMs,
        takeCount: closed.takeCount + 1,
        takes: closed.takes.length < MAX_TAKES
          ? [...closed.takes, this.toApiTake(take, activeMs, snapshot, false)] : closed.takes,
        totals: { ...closed.totals },
        measures: new Map(Array.from(closed.measures, ([measure, counters]) => [measure, { ...counters }])),
      };
      this.mergeTake(session, take, snapshot);
      endedAt = now;
    }

    const measures: PracticeMeasure[] = Array.from(session.measures.entries())
      .sort(([a], [b]) => a - b)
      .map(([measure, counters]) => ({ measure, ...toApiCounters(counters) }));
    const item = session.item;
    const identity: Pick<PracticeSessionApiInfo, 'kind' | 'scoreId' | 'title' | 'exerciseType' | 'patternKey' | 'exerciseKey' | 'tonic' | 'mode'> =
      item.kind === 'score'
        ? { kind: 'score', scoreId: item.scoreId, title: item.title }
        : {
          kind: 'exercise', exerciseType: item.exerciseType, patternKey: item.patternKey,
          exerciseKey: item.exerciseKey, tonic: item.tonic, mode: item.mode, title: item.title,
        };
    const elapsedSeconds = Math.floor((endedAt - session.startedAt) / 1000);
    return {
      ...identity,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      timeZone: this.timeZone(),
      activeSeconds: Math.min(Math.round(session.activeMs / 1000), elapsedSeconds),
      takeCount: session.takeCount,
      completedCount: session.completedCount,
      measureStart: session.measureStart,
      measureEnd: session.measureEnd,
      measureTotal: session.measureTotal,
      hands: session.hands,
      tempoFactor: session.tempoFactor,
      metronome: session.metronome,
      loop: session.loop,
      input: session.midiInput ? 'midi' : 'none',
      endReason: reason === 'checkpoint' ? undefined : reason,
      ...toApiCounters(session.totals),
      measures,
      takes: session.takes,
    };
  }

  private timeZone(): string | undefined {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }

  private stopCheckpoints(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = undefined;
    }
  }

  // --- sending -----------------------------------------------------------------------------------------------

  private send(id: string, payload: PracticeSessionApiInfo, keepalive: boolean): void {
    if (keepalive) {
      this.sendKeepalive(id, payload);
      return;
    }
    // Resolved lazily: the recorder is created with the player, long before anything is sent
    this.injector.get(PracticeService).practiceSessionPut(id, payload).subscribe({
      next: () => this.sent(id, payload),
      error: (error: unknown) => {
        if (this.isRefusal(error instanceof HttpErrorResponse ? error.status : 0)) {
          this.removeFromOutbox(id);
        }
        console.warn('Practice session not saved yet', error);
      },
    });
  }

  /**
   * fetch() with keepalive outlives the page, and unlike navigator.sendBeacon() it can carry the CSRF header.
   * The body stays far below the 64 KB keepalive limit: it only holds aggregates.
   */
  private sendKeepalive(id: string, payload: PracticeSessionApiInfo): void {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = readCookie(this.document.cookie ?? '', XSRF_COOKIE_NAME);
    if (token) {
      headers[XSRF_HEADER_NAME] = token;
    }
    try {
      void fetch(`${this.apiBase}/practice/session/${encodeURIComponent(id)}`, {
        method: 'PUT', keepalive: true, credentials: 'include', headers, body: JSON.stringify(payload),
      }).then((response) => {
        if (response.ok) {
          this.sent(id, payload);
        } else if (this.isRefusal(response.status)) {
          this.removeFromOutbox(id);
        }
      }).catch(() => undefined); // stays in the outbox
    } catch {
      // stays in the outbox
    }
  }

  /** The server has this version: forget the copy, unless a newer one was written meanwhile. */
  private sent(id: string, payload: PracticeSessionApiInfo): void {
    const entry = this.readOutbox()[id];
    if (entry && entry.session.endedAt === payload.endedAt) {
      this.removeFromOutbox(id);
    }
  }

  /** The server will never take this session (invalid, not ours): retrying is pointless. 401 and 429 may pass. */
  private isRefusal(status: number): boolean {
    return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
  }

  // --- outbox ------------------------------------------------------------------------------------------------

  private readOutbox(): Record<string, OutboxEntry> {
    try {
      const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveOutbox(outbox: Record<string, OutboxEntry>): void {
    try {
      if (Object.keys(outbox).length === 0) {
        localStorage.removeItem(OUTBOX_KEY);
      } else {
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
      }
    } catch {
      // storage full or unavailable: the session is still sent, just not kept for a retry
    }
  }

  private writeOutbox(id: string, entry: OutboxEntry): void {
    const outbox = this.readOutbox();
    outbox[id] = entry;
    const ids = Object.keys(outbox).sort((a, b) => outbox[a].savedAt - outbox[b].savedAt);
    for (const oldest of ids.slice(0, Math.max(0, ids.length - OUTBOX_MAX_ENTRIES))) {
      delete outbox[oldest];
    }
    this.saveOutbox(outbox);
  }

  private removeFromOutbox(id: string): void {
    const outbox = this.readOutbox();
    if (id in outbox) {
      delete outbox[id];
      this.saveOutbox(outbox);
    }
  }
}
