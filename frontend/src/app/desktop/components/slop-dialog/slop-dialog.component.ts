import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { ScoreApiInfo } from '../../../core/api';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../account/services/auth.service';
import { ScoreService } from '../../../core/api/api/score.service';

@Component({
    selector: 'app-slop-dialog',
    templateUrl: './slop-dialog.component.html',
    styleUrls: ['./slop-dialog.component.css'],
    imports: [CommonModule]
})

export class SlopDialogComponent {
    loading = false;
    loadingText = '';
    error = false;
    errorText = '';

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


    async repair() {
        if (!this.scoreData || !this.scoreData?.id || !this.scoreData?.version || !this.scoreData?.owner_id) return;
        this.loading = true;
        this.loadingText = 'Downloading...';
        this.error = false;
        this.errorText = '';
        try {
            await new Promise<void>((resolve, reject) => {
                this.scoreService.scoreOwnerIdTypeVersionRevisionGet(
                    this.scoreData!.owner_id!,
                    this.scoreData!.id!,
                    'midi',
                    this.scoreData!.version!,
                    1
                ).subscribe({
                    next: async (data: any) => {
                        try {
                            const arrayBuffer = await data.arrayBuffer();
                            const blob = new Blob([arrayBuffer], { type: 'audio/midi' });
                            this.loadingText = 'Computing...';
                            if (this.cdr) {
                                this.cdr.detectChanges();
                            } else {
                                console.warn('[SlopDialogComponent] ChangeDetectorRef is undefined');
                            }
                            this.scoreService.scoreIdTypeVersionRevisionPost(
                                this.scoreData!.id!,
                                'midi',
                                this.scoreData!.version!,
                                0,
                                blob,
                                undefined,
                                undefined,
                                true
                            ).subscribe({
                                next: (res) => {
                                    this.loading = false;
                                    this.loadingText = '';
                                    this.error = false;
                                    this.errorText = '';
                                    alert('Repair POST success!');
                                    this.close();
                                    resolve();
                                },
                                error: (err) => {
                                    this.loading = false;
                                    this.loadingText = '';
                                    this.error = true;
                                    this.errorText = ' (POST) ' + (err?.message || err);
                                    if (this.cdr) {
                                        this.cdr.detectChanges();
                                    } else {
                                        console.warn('[SlopDialogComponent] ChangeDetectorRef is undefined');
                                    }
                                    reject(err);
                                }
                            });
                        } catch (e) {
                            this.loading = false;
                            this.loadingText = '';
                            this.error = true;
                            this.errorText = ' (MIDI) ' + (e as any)?.message;
                            if (this.cdr) {
                                this.cdr.detectChanges();
                            } else {
                                console.warn('[SlopDialogComponent] ChangeDetectorRef is undefined');
                            }
                            reject(e);
                        }
                    },
                    error: (err) => {
                        this.loading = false;
                        this.loadingText = '';
                        this.error = true;
                        this.errorText = ' (DOWNLOAD) ' + (err?.message || err);
                        if (this.cdr) {
                            this.cdr.detectChanges();
                        } else {
                            console.warn('[SlopDialogComponent] ChangeDetectorRef is undefined');
                        }
                        reject(err);
                    }
                });
            });
        } catch (e) {
            this.loading = false;
            this.loadingText = '';
            if (this.cdr) {
                this.cdr.detectChanges();
            } else {
                console.warn('[SlopDialogComponent] ChangeDetectorRef is undefined');
            }
        }
    }
}
