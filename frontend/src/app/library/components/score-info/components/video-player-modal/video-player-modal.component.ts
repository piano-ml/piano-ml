import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { ScoreService, YoutubeVideoApiInfo } from '../../../../../core/api';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapEyeSlash, bootstrapHandThumbsDown, bootstrapHandThumbsUp } from '@ng-icons/bootstrap-icons';

type YoutubeAction = 'upvote' | 'downvote' | 'report' | 'view';

@Component({
  selector: 'app-video-player-modal',
  standalone: true,
  imports: [CommonModule, YouTubePlayerModule, NgIcon],
  templateUrl: './video-player-modal.component.html',
  styleUrl: './video-player-modal.component.css',
  viewProviders: [provideIcons({ bootstrapHandThumbsUp, bootstrapHandThumbsDown, bootstrapEyeSlash })]
})
export class VideoPlayerModalComponent {
  @Input() open = false;
  @Input() video: YoutubeVideoApiInfo | null = null;
  @Input() scoreId: string | null = null;
  @Output() close = new EventEmitter<void>();

  readonly playerWidth = 960;
  readonly playerHeight = 540;
  readonly actionLoading: Partial<Record<YoutubeAction, boolean>> = {};
  private lastPlayerState: number | null = null;

  constructor(private scoreService: ScoreService) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.onClose();
    }
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onClose(): void {
    this.close.emit();
  }

  onPlayerStateChange(event: YT.OnStateChangeEvent): void {
    const wasPlaying = this.lastPlayerState === 1;
    this.lastPlayerState = event.data;

    if (!wasPlaying && event.data === 1) {
      this.sendYoutubeAction('view');
    }
  }

  onYoutubeAction(action: 'upvote' | 'downvote' | 'report'): void {
    this.sendYoutubeAction(action);
  }

  private sendYoutubeAction(action: YoutubeAction): void {
    const videoId = this.video?.videoId;
    if (!this.scoreId || !videoId) {
      return;
    }

    this.actionLoading[action] = true;
    this.scoreService.scoreYoutubeEdit(this.scoreId, videoId, action).subscribe({
      next: () => {
        this.actionLoading[action] = false;
      },
      error: (error) => {
        this.actionLoading[action] = false;
        console.error(`Error during video action ${action}:`, error);
      }
    });
  }
}
