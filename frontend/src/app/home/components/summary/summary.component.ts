import { Component, ChangeDetectionStrategy } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-summary',
  imports: [RouterModule],
  templateUrl: './summary.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './summary.component.css'
})
export class SummaryComponent {
  summary = [
    {
      url: '/library',
      title: $localize`:@@summary.library.title:Library`,
      description: $localize`:@@summary.library.description:Practice scores from the library — upload PDF, MIDI or MusicXML files — search for specific pieces, genre, grade, tonic.`,
      image: '/assets/images/keyboard.webp',
      cta: $localize`:@@summary.library.cta:Open library`,
      keywords: 'sheet music, PDF upload, MIDI files, MusicXML, digital scores'
    },
    {
      url: '/exercises/',
      title: $localize`:@@summary.exercises.title:Exercises`,
      description: $localize`:@@summary.exercises.description:Scales generator, arpeggios, and practice exercises around the circle of fifths.`,
      image: '/assets/images/midi.webp',
      cta: $localize`:@@summary.exercises.cta:Scales & exercises`,
      keywords: 'piano scales, major scales, minor scales, music theory'
    },
    {
      url: '/blog/methods',
      title: $localize`:@@summary.etudes.title:Études for Pianists`,
      description: $localize`:@@summary.etudes.description:Collection of digitized musical courses for classical piano study.`,
      image: '/assets/images/Burgmuller-1.webp',
      cta: $localize`:@@summary.etudes.cta:Browse collection`,
      keywords: 'Burgmüller, piano études, piano methods, classical piano'
    },
    {
      url: '/blog/thanks-and-acknowledgments',
      title: $localize`:@@summary.thanks.title:Acknowledgments`,
      description: $localize`:@@summary.thanks.description:The people and open-source projects that made PianoML possible.`,
      image: '/assets/images/one-piece-straw-hat-luffy-black-and-white-pfp-o546iu7rtqxomb0b.webp',
      cta: $localize`:@@summary.thanks.cta:Read more`,
      keywords: 'acknowledgments, credits, contributors'
    }
  ]
  
  constructor(private route: Router) {}
}
