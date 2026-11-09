import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { YoutubeVideoApiInfo } from '../../../../../core/api';

@Component({
  selector: 'app-video-carousel-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-carousel-item.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './video-carousel-item.component.css'
})
export class VideoCarouselItemComponent {
  @Input({ required: true }) video!: YoutubeVideoApiInfo;
  @Output() selectVideo = new EventEmitter<YoutubeVideoApiInfo>();

  onSelect(): void {
    this.selectVideo.emit(this.video);
  }
}
