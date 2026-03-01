import { ChangeDetectionStrategy, Component, type ElementRef, ViewChild, signal, effect, type EffectRef, OnDestroy, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from '@angular/common';
import { MidiServiceService } from "../../../shared/services/midi-service.service";
import PianoKeys from '@jesperdj/pianokeys';
import { midiToPitch } from "../../service/midi-maths";
import { PlayerKeyboardService } from "../../service/player-keyboard.service";


@Component({
  selector: 'app-keyboard',
  imports: [],
  templateUrl: './keyboard.component.html',
  styleUrl: './keyboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardComponent implements OnDestroy {

  private platformId = inject(PLATFORM_ID);
  keyPressed = signal<{ key: number; timestamp: number } | null>(null);
  keyReleased = signal<{ key: number; timestamp: number } | null>(null);

  private effectRefs: EffectRef[] = [];

  @ViewChild('keyboardContainer')
  keyboardContainer!: ElementRef;
  keyboard: PianoKeys.Keyboard | null = null;


  constructor(
    private keyboardService: PlayerKeyboardService,    
    private midiService: MidiServiceService
  ) {
    this.registerWithMidiService();
  }


  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const preferences = localStorage.getItem("preferences");
    const parsedPreferences = JSON.parse(preferences || '{}');
    const leftmostKey = midiToPitch(parsedPreferences.leftmostKey || 21) || null;
    const rightmostKey = midiToPitch(parsedPreferences.rightmostKey || 108) || null;

    this.keyboard = new PianoKeys.Keyboard(
      this.keyboardContainer.nativeElement,
      {
        lowest: leftmostKey ,
        highest: rightmostKey
      });
    this.keyboardService.setPianoKeys(this.keyboard);
    this.attachKeyboardListeners();
  }

  private registerWithMidiService(): void {
    // Effect pour écouter les touches pressées
    const pressedEffect = effect(() => {
      const keyEvent = this.keyPressed();
      if (keyEvent !== null) {
        this.midiService.press(keyEvent.key, 255);
      }
    });
    this.effectRefs.push(pressedEffect);

    // Effect pour écouter les touches relâchées
    const releasedEffect = effect(() => {
      const keyEvent = this.keyReleased();
      if (keyEvent !== null) {
        this.midiService.release(keyEvent.key);
      }
    });
    this.effectRefs.push(releasedEffect);
  }

  ngOnDestroy(): void {
    // Nettoyer les effects pour éviter les fuites mémoire
    for (const effectRef of this.effectRefs) {
      effectRef.destroy();
    }
    this.effectRefs = [];
  }

  private attachKeyboardListeners(): void {
    
    if (this.keyboard === null) {
      console.error('Keyboard instance is not initialized.');
      return;
    }
    
    this.keyboard.setOnKeyMouseDown((event: MouseEvent, keyInfo: { note: number, name: string }) => {
      console.log({ key: keyInfo.note, timestamp: Date.now() });
      this.keyPressed.set({ key: 12+ Number(keyInfo.note), timestamp: Date.now() });
      this.keyboardService.press(keyInfo.name, 12+ Number(keyInfo.note) ); // Ensure the note is released before pressing again (handles repeated notes)
    });

    this.keyboard.setOnKeyMouseUp((event: MouseEvent, keyInfo: { note: number, name: string }) => {
      console.log({ key: keyInfo.note, timestamp: Date.now() });
      this.keyReleased.set({ key: 12+ Number(keyInfo.note), timestamp: Date.now() });
      this.keyboardService.release(keyInfo.name, 12+ Number(keyInfo.note));
    });

  }

}