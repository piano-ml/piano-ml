import { CommonModule } from '@angular/common';
// biome-ignore lint/style/useImportType: <explanation>
import { HttpClient } from '@angular/common/http';
// biome-ignore lint/style/useImportType: <explanation>
import { Component, ChangeDetectorRef } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
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

  constructor(private http: HttpClient, private router: Router, private changeDetector: ChangeDetectorRef) {
    this.http.get(`${this.rootPath}/manifest.json`).subscribe(data => {
      this.manifest = data as ProvidedSong[];
      this.changeDetector.detectChanges();
    });
  }


  onSongClick(providedSong: ProvidedSong) {
    this.router.navigate(['/open', providedSong.filename]);
  }



}
