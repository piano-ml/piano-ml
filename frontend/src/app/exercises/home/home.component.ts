import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule,RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  summary = [
    {
      url: 'agility',
      title: 'Agility',
      description: 'Agility is the ability to move quickly and easily. It requires quick reflexes, coordination, balance, speed, and correct response to the changing situation.',
    },
    {
      url: 'scale',
      title: 'Scale',
      description: 'A scale is a series of notes that are played in a specific order. Scales are used to create melodies, harmonies, and chords.',
    },    
  ]
  constructor(private route: Router) { }

}