import { Component, type OnInit } from '@angular/core';
import { OpenComponent } from '../open/open.component';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router } from '@angular/router';
import { BuiltinComponent } from "../builtin/builtin.component";

@Component({
  selector: 'app-loader-home',
  imports: [OpenComponent, BuiltinComponent],
  templateUrl: './loader-home.component.html',
  styleUrl: './loader-home.component.css'
})
export class LoaderHomeComponent implements OnInit {

  filename = '';
  
  constructor(
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.filename = params["filename"];
    });
  }



}
