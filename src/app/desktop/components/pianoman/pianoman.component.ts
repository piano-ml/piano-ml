import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { left, right } from '@criblinc/docker-names'
import type { UserPerformance } from '../desktop/desktop.component';

@Component({
  selector: 'app-pianoman',
  imports: [],
  templateUrl: './pianoman.component.html',
  styleUrl: './pianoman.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianomanComponent {


  @Input()
  hash!: string;

  @Input()
  performance!: UserPerformance;

  nickname!: string;

  ngOnInit() {
    this.nickname = this.generateNickName(this.hash);
  }

  generateNickName(hash: string): string {
    const hashValue = Array.from(hash).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const first = (hashValue % 1000) / 1000;
    const second = ((hashValue * 31) % 1000) / 1000;
    const leftElement = this.capitalizeFirstLetter(left[Math.floor(first * left.length)]);
    const rightElement = this.capitalizeFirstLetter(right[Math.floor(second * right.length)]);
    return `${leftElement} ${rightElement}`;
  }

  capitalizeFirstLetter(val: string): string {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
  }

}
