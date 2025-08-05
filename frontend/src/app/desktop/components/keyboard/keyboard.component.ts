import { ChangeDetectionStrategy, Component, type ElementRef, ViewChild } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { ScoreStateService } from "../../service/score-state.service";


@Component({
  selector: 'app-keyboard',
  imports: [],
  templateUrl: './keyboard.component.html',
  styleUrl: './keyboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardComponent {


  @ViewChild('keyboardContainer')
  keyboardContainer!: ElementRef;

  scoreState: ScoreStateService;


  constructor(scoreState: ScoreStateService) {
    this.scoreState = scoreState;
  }


  ngAfterViewInit(): void {
    this.scoreState.setKeyboardElement(this.keyboardContainer);
  }


}



