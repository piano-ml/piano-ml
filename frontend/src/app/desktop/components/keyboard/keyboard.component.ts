import { ChangeDetectionStrategy, Component, type ElementRef, ViewChild } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { ScoreStateService } from "../../service/score-state.service";
import { PlayerService } from "../../service/player.service";


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

  //private playerService: PlayerService;


  constructor(private playerService: PlayerService)  {
    this.playerService = playerService;
  }


  ngAfterViewInit(): void {
    this.playerService.setKeyboardElement(this.keyboardContainer);
  }


}



