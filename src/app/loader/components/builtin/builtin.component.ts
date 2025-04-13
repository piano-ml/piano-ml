import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router } from '@angular/router';


interface ProvidedSong {
  "filename": string;
  "difficulty": string;
  "name": string;
  "description": string;
  "artist": string;

}

@Component({
  selector: 'app-builtin',
  imports: [CommonModule],
  templateUrl: './builtin.component.html',
  styleUrl: './builtin.component.css'
})
export class BuiltinComponent {




  manifest: ProvidedSong[] = [];
  rootPath = '/assets/midi';

  constructor(private http: HttpClient, private router: Router) {
    this.http.get(`${this.rootPath}/manifest.json`).subscribe(data => {
      this.manifest = data as ProvidedSong[];
    });
  }


  onSongClick(providedSong: ProvidedSong) {
    this.router.navigate(['/open', providedSong.filename]);
  }



}
