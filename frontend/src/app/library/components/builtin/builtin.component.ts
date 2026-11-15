
// biome-ignore lint/style/useImportType: <explanation>
import { HttpClient } from '@angular/common/http';
// biome-ignore lint/style/useImportType: <explanation>
import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { Router } from '@angular/router';
import { difficultyLabel, songDescription } from '../../../shared/i18n/content-messages';


interface ProvidedSong {
  "filename": string;
  "difficulty": string;
  "name": string;
  "description": string;
  "artist": string;

}

@Component({
  selector: 'app-builtin',
  imports: [],
  templateUrl: './builtin.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './builtin.component.css'
})
export class BuiltinComponent {

  protected readonly songDescription = songDescription;
  protected readonly difficultyLabel = difficultyLabel;
  manifest: ProvidedSong[] = [];
  rootPath = '/assets/midi';

  constructor(private http: HttpClient, private router: Router, private changeDetector: ChangeDetectorRef) {
    this.http.get(`${this.rootPath}/manifest.json`).subscribe(data => {
      this.manifest = data as ProvidedSong[];
      this.changeDetector.detectChanges();
    });
  }


  onSongClick(providedSong: ProvidedSong) {
    this.router.navigate(['/library', providedSong.filename]);
  }



}
