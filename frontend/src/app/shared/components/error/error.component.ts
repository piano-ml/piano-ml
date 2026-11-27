import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ResponseStatusService } from '../../seo/response-status.service';

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './error.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./error.component.css']
})
export class ErrorComponent {
  /** An unknown URL (the wildcard route): a page that does not exist rather than an error. */
  protected readonly notFound: boolean;

  /** Answers with the route's `data.status`, so the wildcard route is a 404. */
  constructor() {
    const status = inject(ActivatedRoute).snapshot.data['status'] as number | undefined;
    this.notFound = status === 404;

    if (status) {
      inject(ResponseStatusService).set(status);
    }
  }
}
