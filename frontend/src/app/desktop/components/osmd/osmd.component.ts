import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
export class OsmdComponent implements OnInit, OnDestroy{
    osmd: OpenSheetMusicDisplay | null = null;

    @Input() scoreData: ScoreApiInfo | null = null;
    @Input() musicXml: string | null = null;
    @ViewChild('osmdContainer', { static: true }) osmdContainer!: ElementRef;
    @ViewChild('scrollableElement') scrollableElement!: ElementRef<HTMLDivElement>;

    loading = false;
    error: string | null = null;

    private cursorObserver?: MutationObserver;
    private lastScrollLeft: number = 0;
    private lastCursorLeft: number = 0;
    private scrollAnimationFrame?: number;

    constructor(
        private playerService: PlayerService,
    ) { }

    ngOnInit() {
        this.loadMusicXML();
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

        this.loading = true;
        this.error = null;

        this.osmd = new OpenSheetMusicDisplay(this.osmdContainer.nativeElement);
        this.osmd.EngravingRules.SheetMaximumWidth = SHEET_MAXIMUM_WIDTH;

        this.osmd.setOptions(DEFAULT_OSMD_OPTIONS);

        if (this.musicXml) {
            await this.osmd.load(this.musicXml).then(() => {
                // ... do nothing here
            });
            this.osmd!.render();
            // there is not onRenderComplete callback, so we use a timeout ...
            setTimeout(() => {
                this.loading = false;
                if (!this.osmd!.cursor) {
                    console.warn("osmd.cursor is undefined!");
                } else {
                    // caqlculate Y
                    const partCount = this.osmd!.GraphicSheet.MeasureList[0].length;
                    const positionAndShape = this.osmd!.GraphicSheet.MeasureList[0][partCount - 1].PositionAndShape;
                    let y = 100;
                    if (partCount === 1) {
                        y = positionAndShape.Parent.BoundingMarginRectangle.height * 1.1
                    } else {
                        y = positionAndShape.AbsolutePosition.y + positionAndShape.BoundingRectangle.height;
                    }
                    // set cursor height
                    const cursorElement = document.getElementById('cursorImg-0');
                    if (cursorElement) {
                        cursorElement.style.setProperty('height', y * 10 + "px", 'important');
                    }
                    this.osmd!.cursors[0].SkipInvisibleNotes = true;
                    this.osmd!.cursors[0].show();
                    this.osmd!.cursors[0].reset();
                    this.playerService.setOsmd(this.osmd!);
                }
            }, 100);
        }
    }
}
