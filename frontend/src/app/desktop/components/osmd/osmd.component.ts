import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { Subscription } from 'rxjs';
import { Cursor, CursorOptions, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { PlayerService } from '../../service/player.service';

@Component({
    selector: 'app-osmd',
    imports: [CommonModule],
    templateUrl: './osmd.component.html',
    styleUrl: './osmd.component.css'
})
export class OsmdComponent implements OnInit, OnDestroy, AfterViewInit {
    osmd: OpenSheetMusicDisplay | null = null;

    @Input() scoreData: ScoreApiInfo | null = null;
    @Input() musicXml: string | null = null;
    @ViewChild('osmdContainer', { static: true }) osmdContainer!: ElementRef;
    @ViewChild('scrollableElement') scrollableElement!: ElementRef<HTMLDivElement>;

    loading = false;
    error: string | null = null;
    private subscription?: Subscription;
    cursor: Cursor | null = null;
    private mutationObserver?: MutationObserver;

    constructor(
        private playerService: PlayerService,
        private changeDetector: ChangeDetectorRef
    ) { }

    ngOnInit() {
        setTimeout(() => {
            this.loadMusicXML();
        }, 100);

    }

    ngAfterViewInit() {
        this.createScrollIntoViewShim();
    }

    ngOnDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
    }

    private async loadMusicXML() {

        this.loading = true;
        this.error = null;

        this.osmd = new OpenSheetMusicDisplay(this.osmdContainer.nativeElement);
        this.osmd.EngravingRules.SheetMaximumWidth = 8000000000000;

        this.osmd.setOptions({ // https://opensheetmusicdisplay.github.io/classdoc/interfaces/IOSMDOptions.html
            //drawingParameters: 'default',
            pageFormat: 'Endless',
            //autoResize: true,
            autoBeam: true,
            autoBeamOptions: {
                groups: [[4,4]],
            },
            //alignRests: 0,
            drawLyricist: true,
            measureNumberInterval: 5,
            //spacingFactorSoftmax: 100,
            //useXMLMeasureNumbers: true,
            //disableCursor: false,
            backend: "svg",
            cursorsOptions: [
                {
                    follow: true,
                    color: "#B0F2B4",
                    alpha: .6,
                    type: 4
                },
            ] as CursorOptions[],
            drawTitle: false,
            darkMode: false,
            renderSingleHorizontalStaffline: true,
            drawCredits: false,
            drawComposer: false,
            drawPartNames: false,
            drawMeasureNumbers: true,
            drawFingerings: true,
            drawLyrics: true,
            drawMetronomeMarks: false,
            coloringEnabled: true,
            followCursor: true,
        });
        if (this.musicXml) {
            await this.osmd.load(this.musicXml).then(() => {
                this.osmd!.EngravingRules.SheetMaximumWidth = Number.MAX_SAFE_INTEGER;
            });
            this.osmd!.render();
            setTimeout(() => {
                this.loading = false;
                if (!this.osmd!.cursor) {
                    console.warn("osmd.cursor is undefined!");
                } else {

                    this.osmd!.cursors[0].SkipInvisibleNotes = true;
                    this.osmd!.cursors[0].show();
                    this.osmd!.cursors[0].reset();
                    this.playerService.setOsmd(this.osmd!);
                }
            }, 20);
        }
    }

    private createScrollIntoViewShim() {
        // Observer pour détecter quand l'élément cursorImg-0 est ajouté au DOM
        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        // Vérifier si c'est l'élément recherché ou s'il le contient
                        const cursorElement = element.id === 'cursorImg-0' ? element : element.querySelector('#cursorImg-0');

                        if (cursorElement) {
                            this.applyScrollIntoViewShim(cursorElement as HTMLElement);
                            // Nettoyer l'observer une fois le shim appliqué
                            this.cleanupMutationObserver();
                        }
                    }
                });
            });
        });

        this.mutationObserver.observe(this.osmdContainer.nativeElement, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            const existingElement = document.getElementById('cursorImg-0');
            if (existingElement) {
                this.applyScrollIntoViewShim(existingElement);
                this.cleanupMutationObserver();
            }
        }, 500);
    }

    private cleanupMutationObserver() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = undefined;
        }
    }

    private applyScrollIntoViewShim(element: HTMLElement) {
        const originalScrollIntoView = element.scrollIntoView.bind(element);
        element.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
            arg = { behavior: 'smooth', inline: 'center', block: 'end' }
            originalScrollIntoView(arg);
        };
    }
}
