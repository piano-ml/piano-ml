import { Component, Input, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ScoreApiInfo } from '../../../core/api';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../account/services/auth.service';
import { ScoreService } from '../../../core/api/api/score.service';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-slop-dialog',
    templateUrl: './slop-dialog.component.html',
    styleUrls: ['./slop-dialog.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CommonModule]
})

export class SlopDialogComponent {
    loading = false;
    loadingText = '';
    error = false;
    errorText = '';
    /** The repair went through: the dialog offers to reload the rebuilt score. */
    repaired = false;

    constructor(
        public authService: AuthService,
        private scoreService: ScoreService,
        private cdr: ChangeDetectorRef
    ) { }

    @Input() show = false;
    @Input() scoreData: ScoreApiInfo | null = null;
    @Input() close!: () => void;


    onBackdropClick(event: Event) {
        if (event.target === event.currentTarget) {
            this.close();
        }
    }

    isOwner(): boolean {
        const currentUserId = this.authService.getUserId();
        return this.authService.isAdmin() || !!(currentUserId && this.scoreData?.owner_id && currentUserId === this.scoreData.owner_id);
    }


    /**
     * Rebuilds the score on the server from its own MIDI file (download, then upload with fingering). Progress, the
     * outcome and any failure are shown inside the dialog.
     */
    async repair() {
        const score = this.scoreData;
        if (!score?.id || !score.version || !score.owner_id || this.loading) return;
        this.loading = true;
        this.repaired = false;
        this.error = false;
        this.errorText = '';
        let step: 'download' | 'read' | 'upload' = 'download';
        try {
            this.setLoadingText($localize`:@@slop.downloading:Downloading...`);
            const file = await firstValueFrom(this.scoreService.scoreOwnerIdTypeVersionRevisionGet(score.owner_id, score.id, 'midi', score.version, 1));
            step = 'read';
            const midi = new Blob([await file.arrayBuffer()], { type: 'audio/midi' });
            step = 'upload';
            this.setLoadingText($localize`:@@slop.computing:Computing...`);
            await firstValueFrom(this.scoreService.scoreIdTypeVersionRevisionPost(score.id, 'midi', score.version, 0, midi, undefined, undefined, true));
            this.repaired = true;
        } catch (e) {
            console.error(`[SlopDialogComponent] repair failed (${step})`, e);
            this.error = true;
            this.errorText = repairErrorMessage(step, e);
        } finally {
            this.loading = false;
            this.loadingText = '';
            this.cdr.detectChanges();
        }
    }

    /** Reloads the page so the practice view uses the rebuilt score. */
    reload() {
        window.location.reload();
    }

    private setLoadingText(text: string) {
        this.loadingText = text;
        this.cdr.detectChanges();
    }
}

/** What to tell the owner when a repair step fails, and what to do about it. */
export function repairErrorMessage(step: 'download' | 'read' | 'upload', error: unknown): string {
    const what = {
        download: $localize`:@@slop.error.download:The MIDI file of this score could not be downloaded.`,
        read: $localize`:@@slop.error.read:The MIDI file of this score could not be read.`,
        upload: $localize`:@@slop.error.upload:The server could not rebuild this score.`,
    }[step];
    const status = error instanceof HttpErrorResponse ? error.status : undefined;
    switch (status) {
        case 0: return `${what} The server cannot be reached: check your connection and try again.`;
        case 401: return `${what} Please log in again.`;
        case 403: return `${what} You are not allowed to repair this score.`;
        case 404: return `${what} The file is not available.`;
        default: return `${what} Please try again later.`;
    }
}
