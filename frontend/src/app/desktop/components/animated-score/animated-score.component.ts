// biome-ignore lint/style/useImportType: <explanation>
import { type AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, type ElementRef, HostListener, Input, OnDestroy, type OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
// biome-ignore lint/style/useImportType: <explanation>
import { EngravingService } from '../../service/engraving.service';
// biome-ignore lint/style/useImportType: <explanation>
import { ScoreStateService } from '../../service/score-state.service';
import type { Subscription } from 'rxjs';
// biome-ignore lint/style/useImportType: <explanation>
import { Router } from '@angular/router';


@Component({
  selector: 'app-animated-score',
  imports: [CommonModule],
  templateUrl: './animated-score.component.html',
  styleUrl: './animated-score.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatedScoreComponent implements AfterViewInit, OnDestroy {

  paused = false;

  xposition = 0;
  translationTime = 1;
  easeDuration = .1;
  countdown = 0;
  staveCount = 0;
  tempo = 90;
  subscriptions: Subscription[] = [];

  @ViewChild('scoreContainer') scoreContainer!: ElementRef;

  @Input() ready = false;

  constructor(
    private engravingService: EngravingService,
    private scoreStateService: ScoreStateService,
    private ref: ChangeDetectorRef,
    private router: Router
  ) { }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.xposition = this.getStartOffset();
  }

  applyTranslation(x: number) {
    this.xposition = (this.getStartOffset() - x)
    this.ref.detectChanges();
  }

  pause(paused: boolean) {
    const currentX = this.scoreContainer.nativeElement.getBoundingClientRect().left;
    if (paused) {
      this.xposition = currentX
    } else {
      const fraction = 1 - (currentX / this.engravingService.staveWidth);
      const nextX = currentX + (this.engravingService.staveWidth * fraction);
      this.xposition = nextX
    }
  }

  getStartOffset(): number {
    const pixelRatio = 1;
    if (window.innerHeight > window.innerWidth) {
      return ((window.innerHeight / pixelRatio) / 2);
    }
    return ((window.innerWidth / pixelRatio) / 2);
  }

  ngAfterViewInit(): void {
    const width = this.scoreContainer.nativeElement.offsetWidth;
    try {
      this.engravingService.renderScore(this.scoreContainer, width);
    } catch (e: unknown) {
      console.log(e);
      this.router.navigate(['open'], { state: { errorInfo: e } });
    }
    this.subscriptions.push(this.scoreStateService.xPosition.subscribe((x: number) => {
      this.applyTranslation(x);
    }));
    this.subscriptions.push(this.scoreStateService.countdown.subscribe((x: number) => {
      this.countdown = x;
    }));
  }

  ngOnDestroy(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
  }

}
