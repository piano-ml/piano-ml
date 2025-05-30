import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
// biome-ignore lint/style/useImportType: <explanation>
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { ShareButtons } from 'ngx-sharebuttons/buttons';
import {  bootstrapGithub } from '@ng-icons/bootstrap-icons';

@Component({
  selector: 'app-layout',
  imports: [RouterModule, CommonModule,  ShareButtons, NgIcon],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
    viewProviders: [provideIcons({ bootstrapGithub })],
})
export class LayoutComponent {  
  
  shareLinks = ['facebook','x','reddit','viber','xing']
  
  constructor (
    public breadcrumbService: BreadcrumbService
  ) {
    if (window.innerWidth < 768) {
      console.log(window.innerWidth);
      this.shareLinks = this.shareLinks.splice(0, 2);
    }
    
  }

}
