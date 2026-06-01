import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, PLATFORM_ID, inject, afterNextRender, HostListener, ViewEncapsulation, NgZone } from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { PlayerService } from '../../service/player.service';
import { DEFAULT_OSMD_OPTIONS, SHEET_MAXIMUM_WIDTH } from './osmd.config';

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
    private recalculateTimeoutId?: ReturnType<typeof setTimeout>;
    private cursorNudgeTimeoutId?: ReturnType<typeof setTimeout>;
    private readonly hideFingeringStorageKey = 'hideFingering';
    private readonly hideFingeringAndHarmonyStorageKey = 'hideFingeringAndHarmony';    
    private readonly hideLyricsStorageKey = 'hideLyrics';
    private hideFingeringAndHarmony = false;

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

        if (this.recalculateTimeoutId) {
            clearTimeout(this.recalculateTimeoutId);
            this.recalculateTimeoutId = undefined;
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

        this.osmd.setOptions({
            ...DEFAULT_OSMD_OPTIONS,
            ...this.getCustomOptions(),
        });

        if (this.musicXml) {
            await this.osmd.load(this.musicXml);
            this.osmd!.render(); // unfortunately not resolvable in load callback, we have to wait for the cursor to be available

            // Move complex initialization out of the Angular zone to avoid keeping the app unstable
            this.ngZone.runOutsideAngular(async () => {
                for (let i = 0; i < 20; i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (this.osmd && this.osmd.cursors && this.osmd!.GraphicSheet) {
                        if (this.hideFingeringAndHarmony) {
                            document.querySelectorAll('.vf-text').forEach(el => (el as HTMLElement).style.display = 'none');
                        }
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


    @HostListener('window:resize', ['$event'])
    onResize(event: Event) {
        this.recalculateCursorPosition();

    }

    recalculateCursorPosition() {
        this.ngZone.runOutsideAngular(() => {
            this.recalculateTimeoutId = setTimeout(() => {
                if (!this.osmd || !this.osmd.GraphicSheet || !this.osmd.GraphicSheet.MeasureList || this.osmd.GraphicSheet.MeasureList.length === 0) {
                    return;
                }
                const partCount = this.osmd!.GraphicSheet.MeasureList[0].length;
                const positionAndShape = this.osmd!.GraphicSheet.MeasureList[0][partCount - 1].PositionAndShape;
                let y = 50;
                const cursorElement = document.getElementById('cursorImg-0');
                if (cursorElement) {
                    cursorElement!.style.setProperty('height', y + "px", 'important');
                    if (partCount === 1) {
                        y = (positionAndShape.Parent.BoundingRectangle.height) * 5;
                        cursorElement!.style.setProperty('height', y + "px", 'important');
                    } else {
                        //y = positionAndShape.Parent.BoundingRectangle.height
                        y = (positionAndShape.Parent.AbsolutePosition.y + positionAndShape.Parent.BoundingRectangle.height) * 4.6;
                        cursorElement!.style.setProperty('height', y + "px", 'important');
                    }

                }
                this.playerService.tiltCursor(this.osmd!.Cursor);
            }, 1000);
        });
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
