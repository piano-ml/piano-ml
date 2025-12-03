import { ChangeDetectionStrategy, Component, type ElementRef, ViewChild, signal, effect, type EffectRef, OnDestroy } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { PlayerService } from "../../service/player.service";
import { MidiServiceService } from "../../../shared/services/midi-service.service";


@Component({
  selector: 'app-keyboard',
  imports: [],
  templateUrl: './keyboard.component.html',
  styleUrl: './keyboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardComponent implements OnDestroy {

  keyPressed = signal<{ key: number; timestamp: number } | null>(null);
  keyReleased = signal<{ key: number; timestamp: number } | null>(null);
  currentlyPressedKeys = signal<Set<number>>(new Set());

  private effectRefs: EffectRef[] = [];

  @ViewChild('keyboardContainer')
  keyboardContainer!: ElementRef;


  constructor(
    private playerService: PlayerService,
    private midiService: MidiServiceService
  )  {
    this.playerService = playerService;
    this.registerWithMidiService();
  }


  ngAfterViewInit(): void {
    this.playerService.setKeyboardElement(this.keyboardContainer);
    this.applyKeyRangePreferences();
    this.attachKeyboardListeners();
  }

  private registerWithMidiService(): void {
    // Effect pour écouter les touches pressées
    const pressedEffect = effect(() => {
      const keyEvent = this.keyPressed();
      if (keyEvent !== null) {
        this.midiService.press(keyEvent.key, 100);
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
    const svgElement = this.keyboardContainer.nativeElement.querySelector('svg');
    if (svgElement) {
      const allKeys = svgElement.querySelectorAll('rect.note');
      
      allKeys.forEach((keyElement: Element) => {
        const classAttr = keyElement.getAttribute('class') || '';
        const keyMatch = classAttr.match(/key(\d+)/);
        
        if (keyMatch) {
          const keyNumber = parseInt(keyMatch[1], 10);
          
          // Événement mousedown pour l'appui de la touche
          keyElement.addEventListener('mousedown', () => {
            this.keyPressed.set({ key: keyNumber, timestamp: Date.now() });
            this.currentlyPressedKeys.update(keys => {
              const newKeys = new Set(keys);
              newKeys.add(keyNumber);
              return newKeys;
            });
          });
          
          // Événement mouseup pour le relâchement de la touche
          keyElement.addEventListener('mouseup', () => {
            this.keyReleased.set({ key: keyNumber, timestamp: Date.now() });
            this.currentlyPressedKeys.update(keys => {
              const newKeys = new Set(keys);
              newKeys.delete(keyNumber);
              return newKeys;
            });
          });
          
          // Événement mouseleave pour gérer le cas où la souris quitte la touche pendant l'appui
          keyElement.addEventListener('mouseleave', (event: Event) => {
            const mouseEvent = event as MouseEvent;
            if (mouseEvent.buttons === 1) { // Si le bouton gauche est toujours enfoncé
              this.keyReleased.set({ key: keyNumber, timestamp: Date.now() });
              this.currentlyPressedKeys.update(keys => {
                const newKeys = new Set(keys);
                newKeys.delete(keyNumber);
                return newKeys;
              });
            }
          });
        }
      });
    }
  }

  private applyKeyRangePreferences(): void {
    try {
      const preferences = localStorage.getItem("preferences");
      if (preferences) {
        const parsedPreferences = JSON.parse(preferences);
        const leftmostKey = parsedPreferences.leftmostKey || 21;
        const rightmostKey = parsedPreferences.rightmostKey || 108;
        
        // Applique la classe 'not-keyed' aux touches en dehors de la plage
        this.applyNotKeyedClass(leftmostKey, rightmostKey);
      }
    } catch (error) {
      console.warn('Erreur lors de la lecture des préférences:', error);
    }
  }

  private applyNotKeyedClass(leftmostKey: number, rightmostKey: number): void {
    const svgElement = this.keyboardContainer.nativeElement.querySelector('svg');
    if (svgElement) {
      // Trouve toutes les touches (elements avec class contenant 'key' suivi d'un nombre)
      const allKeys = svgElement.querySelectorAll('[class*="key"]');
      
      allKeys.forEach((keyElement: Element) => {
        const classAttr = keyElement.getAttribute('class') || '';
        const keyMatch = classAttr.match(/key(\d+)/);
        
        if (keyMatch) {
          const keyNumber = parseInt(keyMatch[1], 10);
          
          if (keyNumber < leftmostKey || keyNumber > rightmostKey) {
            keyElement.classList.add('not-keyed');
          } else {
            keyElement.classList.remove('not-keyed');
          }
        }
      });
    }
  }


}