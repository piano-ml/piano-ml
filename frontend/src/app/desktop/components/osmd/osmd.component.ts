import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, PLATFORM_ID, inject, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { PlayerService } from '../../service/player.service';
import { DEFAULT_OSMD_OPTIONS, SHEET_MAXIMUM_WIDTH } from './osmd.config';

@Component({
    selector: 'app-osmd',
    imports: [CommonModule],
    templateUrl: './osmd.component.html',
    styleUrl: './osmd.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OsmdComponent implements OnInit, OnDestroy {
    private platformId = inject(PLATFORM_ID);
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

    constructor(
        private playerService: PlayerService,
    ) {
        // Initialiser uniquement côté client après le rendu
        afterNextRender(() => {
            if (isPlatformBrowser(this.platformId)) {
                this.loadMusicXML();
            }
        });
    }

    ngOnInit() {
        // Ne pas initialiser ici pour éviter l'exécution côté serveur
    }

    ngOnDestroy() {
        if (this.cursorObserver) {
            this.cursorObserver.disconnect();
        }

        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
        }

        // Nettoyer l'instance OSMD
        if (this.osmd) {
            this.osmd.clear();
            this.osmd = null;
        }
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
            for (let i = 0; i < 20; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (this.osmd.cursors) {
                    // caqlculate Y
                    const partCount = this.osmd!.GraphicSheet.MeasureList[0].length;
                    const positionAndShape = this.osmd!.GraphicSheet.MeasureList[0][partCount - 1].PositionAndShape;
                    let y = 100;
                    const cursorElement = document.getElementById('cursorImg-0');
                    if (cursorElement) {
                        if (partCount === 1) {
                            y = positionAndShape.Parent.BoundingRectangle.height
                            cursorElement!.style.setProperty('height', y * 5 + "px", 'important');
                        } else {
                            y = positionAndShape.AbsolutePosition.y + positionAndShape.BoundingRectangle.height;
                            cursorElement!.style.setProperty('height', y * 8 + "px", 'important');
                        }
                    }
                    this.osmd!.cursors[0].SkipInvisibleNotes = true;
                    this.osmd!.cursors[0].show();
                    const status = await this.playerService.setOsmd(this.osmd!);
                    this.loading = false;
                    this.loadingChange.emit(false);
                    break;
                }
            }
        }
    }

    getCustomOptions(): {} {
        const storage = localStorage.getItem("preferences")
        const customOptions: Partial<typeof DEFAULT_OSMD_OPTIONS> = {};
        if (storage) {
            try {
                const preferences = JSON.parse(storage);
                if (preferences.hasOwnProperty("drawFingering")) {
                    customOptions.drawFingerings = preferences.drawFingering;
                }
                if (preferences.hasOwnProperty("drawLyrics")) {
                    customOptions.drawLyrics = preferences.drawLyrics;
                }
            } catch (e) {
                console.error("Error parsing preferences from localStorage", e);
            }
        }
        return customOptions;
    }
}
