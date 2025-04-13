import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
// biome-ignore lint/style/useImportType: <explanation>
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-layout',
  imports: [RouterModule, CommonModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent {
  constructor (
    public breadcrumbService: BreadcrumbService
  ) {
    
  }

}
