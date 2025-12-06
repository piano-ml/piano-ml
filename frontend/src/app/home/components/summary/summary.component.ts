import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-summary',
  imports: [CommonModule, RouterModule],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.css'
})
export class SummaryComponent {

  summary = [
    {
      url: '/exercises/scale',
      title: 'Scales',
      description: 'Scales generator and exercises',
      image: 'assets/images/keyboard.webp'
    },
    {
      url: '/exercises/agility',
      title: 'Agility',
      description: 'Arpeggios, chords, and progression exercises',
      image: 'assets/images/circle_of_fifths_deluxe.svg'
    },
    {
      url: '/library',
      title: 'Library',
      description: 'Practice score from library, upload PDF/MIDI/MusicXML files',
      image: 'assets/images/midi.webp'
    },
    {
      url: '/blog/methods',
      title: 'Études for Pianists',
      description: 'Collection of digitized musical books',
      image: 'assets/images/Burgmuller-1.webp'
    },
    {
      url: '/blog/help',
      title: 'Help',
      description: 'Some help and documentation about the application',
      image: 'assets/images/cat.webp'
    },
    {
      url: '/blog/thanks-and-acknowledgments',
      title: 'Thanks and acknowledgments',
      description: 'They did it !',
      image: 'assets/images/one-piece-straw-hat-luffy-black-and-white-pfp-o546iu7rtqxomb0b.webp'
    }
  ]
  constructor(private route: Router) {
    {
      //      const currentScore = JSON.parse(localStorage.getItem("score") || "{}")
      //      const currentScoreName = currentScore.header?.name
      //      if (currentScoreName) {
      //        this.summary.push({
      //          url: "/desktop",
      //          title: `Practice / ${currentScoreName}`,
      //          description: ""
      //        })
      //      }
    }
  }
}
