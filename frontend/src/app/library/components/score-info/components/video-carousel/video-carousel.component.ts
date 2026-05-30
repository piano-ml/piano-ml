import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { YoutubeVideoApiInfo } from '../../../../../core/api';
import { VideoCarouselItemComponent } from '../video-carousel-item/video-carousel-item.component';

@Component({
  selector: 'app-video-carousel',
  standalone: true,
  imports: [CommonModule, VideoCarouselItemComponent],
  templateUrl: './video-carousel.component.html',
  styleUrl: './video-carousel.component.css'
})
export class VideoCarouselComponent implements AfterViewInit {
  @Input() videos: YoutubeVideoApiInfo[] = [];
  @Output() selectVideo = new EventEmitter<YoutubeVideoApiInfo>();

  @ViewChild('track') private trackRef?: ElementRef<HTMLDivElement>;

  canScrollLeft = false;
  canScrollRight = false;

  ngAfterViewInit(): void {
    this.updateScrollState();
    setTimeout(() => this.updateScrollState(), 0);
  }

  onTrackScroll(): void {
    this.updateScrollState();
  }

  onVideoSelect(video: YoutubeVideoApiInfo): void {
    this.selectVideo.emit(video);
  }

  scrollLeft(): void {
    const track = this.trackRef?.nativeElement;
    if (!track) {
      return;
    }

    track.scrollBy({ left: -Math.max(320, Math.floor(track.clientWidth * 0.9)), behavior: 'smooth' });
  }

  scrollRight(): void {
    const track = this.trackRef?.nativeElement;
    if (!track) {
      return;
    }

    track.scrollBy({ left: Math.max(320, Math.floor(track.clientWidth * 0.9)), behavior: 'smooth' });
  }

  private updateScrollState(): void {
    const track = this.trackRef?.nativeElement;
    if (!track) {
      this.canScrollLeft = false;
      this.canScrollRight = false;
      return;
    }

    this.canScrollLeft = track.scrollLeft > 8;
    this.canScrollRight = track.scrollLeft + track.clientWidth < track.scrollWidth - 8;
  }
}
