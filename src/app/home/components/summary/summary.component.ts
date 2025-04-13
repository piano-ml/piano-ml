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
      title: 'Exercises / Scale',
      description: 'A scale is a series of notes that are played in a specific order. Scales are used to create melodies, harmonies, and chords.',
    },
    {
      url: '/exercises/agility',
      title: 'Exercises / Agility',
      description: 'Agility is the ability to move quickly and easily. It requires quick reflexes, coordination, balance, speed, and correct response to the changing situation.',
    },
    {
      url: '/open',
      title: 'Practice / Open File',
      description: 'Practice using a midi file',
    },
  ]
  constructor(private route: Router) {

    try {
      const currentScore = JSON.parse(localStorage.getItem("score") || "{}")
      const currentScoreName = currentScore.header?.name
      if (currentScoreName) {
        this.summary.push({
          url: "/desktop",
          title: `Practice / ${currentScoreName}`,
          description: ""
        })
      }
    } catch (e) {

    }

  }


}
