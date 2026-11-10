import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './quick-actions.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './quick-actions.component.css'
})
export class QuickActionsComponent {

}
