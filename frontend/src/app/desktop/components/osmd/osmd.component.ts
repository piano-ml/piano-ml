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
export class OsmdComponent implements OnInit, OnDestroy, AfterViewInit {
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

    ngAfterViewInit() {
        this.setupCursorFollowing();
    }

    private setupCursorFollowing() {
        // Attendre que le curseur soit créé
        setTimeout(() => {
            const cursor = document.getElementById('cursorImg-0');
            if (!cursor) return;

            // Observer les changements de position du curseur avec debouncing via requestAnimationFrame
            this.cursorObserver = new MutationObserver((mutations) => {
                // Vérifier si c'est bien un changement de position X (left)
                const hasLeftChanged = mutations.some(mutation => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        const target = mutation.target as HTMLElement;
                        const currentLeft = parseFloat(target.style.left) || 0;
                        if (Math.abs(currentLeft - this.lastCursorLeft) > 5) {
                            this.lastCursorLeft = currentLeft;
                            return true;
                        }
                    }
                    return false;
                });

                if (!hasLeftChanged) return;

                // Annuler le précédent frame si un nouveau changement arrive
                if (this.scrollAnimationFrame) {
                    cancelAnimationFrame(this.scrollAnimationFrame);
                }

                // Utiliser requestAnimationFrame pour synchroniser avec le repaint du navigateur
                this.scrollAnimationFrame = requestAnimationFrame(() => {
                    this.scrollCursorIntoView(cursor);
                });
            });

            this.cursorObserver.observe(cursor, {
                attributes: true,
                attributeFilter: ['style'] // Observer uniquement les changements de style
            });
        }, 200);
    }

    private scrollCursorIntoView(cursorElement: HTMLElement) {
        const container = this.osmdContainer.nativeElement;
        if (!container) return;

        const cursorRect = cursorElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculer la position du curseur relative au conteneur
        const cursorLeft = cursorRect.left - containerRect.left + container.scrollLeft;
        const viewportWidth = containerRect.width;

        // Centrer le curseur horizontalement
        const targetScrollLeft = Math.max(0, cursorLeft - (viewportWidth / 2));

        // Optimisation : ne scroller que si nécessaire (éviter les micro-scrolls)
        if (Math.abs(this.lastScrollLeft - targetScrollLeft) > 20) {
            this.lastScrollLeft = targetScrollLeft;
            container.scrollTo({
                left: targetScrollLeft,
                top: 0, // Toujours garder top à 0
                behavior: targetScrollLeft < 50 ? 'instant' : 'smooth'
            });
        }
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
                this.osmd!.EngravingRules.SheetMaximumWidth = SHEET_MAXIMUM_WIDTH;
            });
            this.osmd!.render();
            // there is not onRenderComplete callback, so we use a timeout ...
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
            }, 100);
        }
    }
}
