import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [],
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingSpinnerComponent {
  private loadingService = inject(LoadingService);
  
  isLoading = this.loadingService.isLoading;
}