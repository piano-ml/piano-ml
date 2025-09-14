import { Component, type OnInit } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BrowseComponent } from "../browse/browse.component";
import { QuickActionsComponent } from '../../../shared/components/quick-actions/quick-actions.component';
import { MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY } from '../../../desktop/model/model';

@Component({
  selector: 'app-loader-home',
  imports: [BrowseComponent, RouterModule, QuickActionsComponent],
  templateUrl: './loader-home.component.html',
  styleUrl: './loader-home.component.css'
})
export class LoaderHomeComponent implements OnInit {

  filename = '';
  
  constructor(
    private route: ActivatedRoute
  ) { 
    localStorage.removeItem(MUSIC_XML_STORAGE_KEY);
    localStorage.removeItem(MIDI_STORAGE_KEY);
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.filename = params["filename"];
    });
  }



}
