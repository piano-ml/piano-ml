import { ChangeDetectionStrategy, Component, type ElementRef, ViewChild } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
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


  constructor(private playerService: PlayerService)  {
    this.playerService = playerService;
  }


  ngAfterViewInit(): void {
    this.playerService.setKeyboardElement(this.keyboardContainer);
    this.applyKeyRangePreferences();
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