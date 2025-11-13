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
    
    private mutationObserver?: MutationObserver;
    private cursorElement?: HTMLElement;
    private originalScrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void;

    constructor(
        private playerService: PlayerService,
    ) { }

    ngOnInit() {
        this.loadMusicXML();
    }

    ngAfterViewInit() {
        this.createScrollIntoViewShim();
    }

    ngOnDestroy() {
        // Restaurer la méthode scrollIntoView originale avant de détruire le composant
        this.restoreScrollIntoView();
        
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
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

        const existingElement = document.getElementById('cursorImg-0');
        if (existingElement) {
            this.applyScrollIntoViewShim(existingElement);
            this.cleanupMutationObserver();
        }
    }

    private cleanupMutationObserver() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = undefined;
        }
    }

    private applyScrollIntoViewShim(element: HTMLElement) {
        // Sauvegarder la référence à l'élément et à la fonction originale
        this.cursorElement = element;
        this.originalScrollIntoView = element.scrollIntoView.bind(element);
        
        // Appliquer le shim
        element.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
            const options: ScrollIntoViewOptions = { behavior: 'smooth', inline: 'center', block: 'end' };
            this.originalScrollIntoView!(options);
        };
    }

    private restoreScrollIntoView() {
        // Restaurer la méthode originale si elle existe
        if (this.cursorElement && this.originalScrollIntoView) {
            this.cursorElement.scrollIntoView = this.originalScrollIntoView;
            this.cursorElement = undefined;
            this.originalScrollIntoView = undefined;
        }
    }
}
