import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { Subscription } from 'rxjs';
import { Cursor, CursorOptions, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { environment } from '../../../../environments/environment';
import { PlayerService } from '../../service/player.service';
import { MUSIC_XML_STORAGE_KEY } from '../../model/model';

@Component({
    selector: 'app-osmd',
    imports: [CommonModule],
    templateUrl: './osmd.component.html',
    styleUrl: './osmd.component.css'
})
export class OsmdComponent implements OnInit, OnDestroy, AfterViewInit {
    osmd: OpenSheetMusicDisplay | null = null;

    @Input() scoreData: ScoreApiInfo | null = null;
    @ViewChild('osmdContainer', { static: true }) osmdContainer!: ElementRef;

    loading = false;
    error: string | null = null;
    private subscription?: Subscription;
    cursor: Cursor | null = null;

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

    }

    ngOnDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }

    private async loadMusicXML() {
        // if (!this.scoreData || !this.scoreData.owner_id || !this.scoreData.mbid) {
        //     this.error = 'Score data is incomplete';
        //     this.changeDetector.detectChanges();
        //     return;
        // }

        this.loading = true;
        this.error = null;
        //this.changeDetector.detectChanges();
        this.osmd = new OpenSheetMusicDisplay(this.osmdContainer.nativeElement);
        //https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/4578938f67a4c4e1e6bd9c659a5b0c95e851e77a/src/OpenSheetMusicDisplay/OSMDOptions.ts#L88
        this.osmd.setOptions({
            autoResize: false,
            useXMLMeasureNumbers: true,
            disableCursor: false,
            backend: "svg",
            cursorsOptions: [
                {
                    follow: true,
                    color: "#fb2c36",
                    alpha: 0.63,
                    type: 0,
                }] as CursorOptions[],

            drawTitle: false,
            autoBeam: true,
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
        if (localStorage.getItem(MUSIC_XML_STORAGE_KEY) !== null) {
            await this.osmd.load(localStorage.getItem(MUSIC_XML_STORAGE_KEY)!);
            this.osmd!.render();            
            setTimeout(() => {
                this.loading = false;
                if (!this.osmd!.cursor) {
                    console.warn("osmd.cursor is undefined!");
                } else {
                    this.osmd!.cursor.show();
                    this.playerService.setOsmdCursor(this.osmd!.cursor);
                }
            }, 1000);
        }
    }
}
