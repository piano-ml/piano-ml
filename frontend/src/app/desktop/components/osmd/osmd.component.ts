import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, PLATFORM_ID, inject, afterNextRender, HostListener, ViewEncapsulation, NgZone } from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { PlayerService } from '../../service/player.service';
import { DEFAULT_OSMD_OPTIONS, PAGE_LEFT_MARGIN, PAGE_RIGHT_MARGIN, SHEET_MAXIMUM_WIDTH } from './osmd.config';

@Component({
    selector: 'app-osmd',
    imports: [],
    templateUrl: './osmd.component.html',

    encapsulation: ViewEncapsulation.None,
    styleUrls: ['./osmd.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OsmdComponent implements OnInit, OnDestroy {
    private platformId = inject(PLATFORM_ID);
    private ngZone = inject(NgZone);
    osmd: OpenSheetMusicDisplay | null = null;

    @Input() scoreData: ScoreApiInfo | null = null;
    @Input() musicXml: string | null = null;
    @Output() loadingChange = new EventEmitter<boolean>();
    @ViewChild('osmdContainer', { static: true }) osmdContainer!: ElementRef;
    @ViewChild('scrollableElement') scrollableElement!: ElementRef<HTMLDivElement>;

    loading = false;
    error: string | null = null;

    private cursorObserver?: MutationObserver;
    private scrollAnimationFrame?: number;
    private cursorNudgeTimeoutId?: ReturnType<typeof setTimeout>;
    private readonly hideFingeringStorageKey = 'hideFingering';
    private readonly hideFingeringAndHarmonyStorageKey = 'hideFingeringAndHarmony';    
    private readonly hideLyricsStorageKey = 'hideLyrics';
    private hideFingeringAndHarmony = false;
    /** The display options the score is drawn with: applyDisplayOptions() re-renders only when they change. */
    private appliedOptions: { drawFingerings: boolean; drawLyrics: boolean; hideFingeringAndHarmony: boolean } | null = null;

    constructor(
        private playerService: PlayerService,
    ) {
    }

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.loadMusicXML();
        }
    }

    ngOnDestroy() {
        this.logLifecycle('destroy:start', {
            hasOsmd: this.osmd != null,
            childCount: this.osmdContainer?.nativeElement?.childElementCount ?? 0,
        });

        if (this.cursorObserver) {
            this.cursorObserver.disconnect();
            this.cursorObserver = undefined;
        }

        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = undefined;
        }

        if (this.cursorNudgeTimeoutId) {
            clearTimeout(this.cursorNudgeTimeoutId);
            this.cursorNudgeTimeoutId = undefined;
        }

        // Nettoyer l'instance OSMD
        if (this.osmd) {
            this.osmd.clear();
            this.osmd = null;
        }

        this.playerService.releaseScoreSession();
        this.osmdContainer.nativeElement.replaceChildren();
        this.logLifecycle('destroy:end', {
            childCount: this.osmdContainer?.nativeElement?.childElementCount ?? 0,
        });
    }

    private async loadMusicXML() {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        this.loading = true;
        this.loadingChange.emit(true);
        this.error = null;

        this.osmd = new OpenSheetMusicDisplay(this.osmdContainer.nativeElement);
        this.osmd.EngravingRules.SheetMaximumWidth = SHEET_MAXIMUM_WIDTH;
        this.osmd.EngravingRules.PageLeftMargin = PAGE_LEFT_MARGIN;
        this.osmd.EngravingRules.PageRightMargin = PAGE_RIGHT_MARGIN;

        const customOptions = this.getCustomOptions();
        this.osmd.setOptions({
            ...DEFAULT_OSMD_OPTIONS,
            ...customOptions,
        });
        this.appliedOptions = { ...customOptions, hideFingeringAndHarmony: this.hideFingeringAndHarmony };

        if (this.musicXml) {
            await this.osmd.load(this.musicXml);
            this.osmd!.render(); // unfortunately not resolvable in load callback, we have to wait for the cursor to be available

            // Move complex initialization out of the Angular zone to avoid keeping the app unstable
            this.ngZone.runOutsideAngular(async () => {
                for (let i = 0; i < 20; i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (this.osmd && this.osmd.cursors && this.osmd!.GraphicSheet) {
                        this.applyFingeringAndHarmonyVisibility();
                        this.recalculateCursorPosition();
                        const status = await this.playerService.setOsmd(this.osmd!);

                        this.ngZone.run(() => {
                            this.loading = false;
                            this.osmd!.cursors[0].SkipInvisibleNotes = true;
                            this.osmd!.cursors[0].show();
                            this.osmd!.cursors[0].reset();
                            this.loadingChange.emit(false);
                        });

                        this.cursorNudgeTimeoutId = setTimeout(() => {
                            //this.osmd!.cursors[0].previous();
                            this.osmd!.cursors[0].next();
                            this.osmd!.cursors[0].previous();
                            //this.osmd!.cursors[0].previous();
                        }, 1000);
                        break;
                    }
                }
            });
        }
    }


    /**
     * Draws the score again with the display options as stored now (fingering, lyrics, fingering & harmony, set in
     * the settings dialog), in place: no page reload, the same cursor position, the same player mapping (the options
     * change the drawing, not the music). Does nothing while the score loads, or when the options did not change.
     * @returns whether the score was drawn again
     */
    applyDisplayOptions(): boolean {
        if (!this.osmd || this.loading || !this.osmd.GraphicSheet) {
            return false;
        }
        const options = this.getCustomOptions();
        const next = { ...options, hideFingeringAndHarmony: this.hideFingeringAndHarmony };
        const before = this.appliedOptions;
        if (before && before.drawFingerings === next.drawFingerings && before.drawLyrics === next.drawLyrics
            && before.hideFingeringAndHarmony === next.hideFingeringAndHarmony) {
            return false;
        }
        this.appliedOptions = next;
        if (!before || before.drawFingerings !== next.drawFingerings || before.drawLyrics !== next.drawLyrics) {
            this.osmd.setOptions(options);
            this.osmd.render();
            // The drawing was replaced: the cursor shows again at its position, on the new drawing
            const cursor = this.osmd.cursors?.[0];
            cursor?.show();
            cursor?.update();
        }
        this.applyFingeringAndHarmonyVisibility();
        this.recalculateCursorPosition();
        return true;
    }

    /** Fingering and harmony texts (VexFlow's .vf-text) hidden or shown, in this score's drawing only. */
    private applyFingeringAndHarmonyVisibility(): void {
        const display = this.hideFingeringAndHarmony ? 'none' : '';
        (this.osmdContainer.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.vf-text')
            .forEach(el => el.style.display = display);
    }

    @HostListener('window:resize', ['$event'])
    onResize(event: Event) {
        this.recalculateCursorPosition();

    }

    /**
     * The player follows the cursor of the drawing as it is now (after a load or a resize). The cursor's size is
     * OSMD's own: on each move it spans the current system, from the top of its first staff to the bottom of its last
     * one (a height forced here, with !important, stopped OSMD from updating it for systems of another height).
     */
    recalculateCursorPosition() {
        if (this.osmd?.Cursor) {
            this.playerService.tiltCursor(this.osmd.Cursor);
        }
    }

    private logLifecycle(message: string, data?: unknown): void {
        if (!this.isDiagnosticEnabled()) {
            return;
        }
        if (data === undefined) {
            console.log(`[osmd][lifecycle] ${message}`);
            return;
        }
        console.log(`[osmd][lifecycle] ${message}`, data);
    }

    private isDiagnosticEnabled(): boolean {
        if (!isPlatformBrowser(this.platformId)) {
            return false;
        }

        try {
            return window.localStorage.getItem('cursorService.debug') === '1';
        } catch {
            return false;
        }
    }


  parseBooleanStorage(key: string): boolean {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      try {
        return JSON.parse(stored);
      } catch {
        return stored === 'true';
      }
    }
    return false;
  }


    getCustomOptions(): any {
        const customOptions: Partial<typeof DEFAULT_OSMD_OPTIONS> = {};
        customOptions.drawFingerings = !this.parseBooleanStorage(this.hideFingeringStorageKey);
        customOptions.drawLyrics = !this.parseBooleanStorage(this.hideLyricsStorageKey);
        this.hideFingeringAndHarmony = this.parseBooleanStorage(this.hideFingeringAndHarmonyStorageKey);
        return customOptions;
    }

}
