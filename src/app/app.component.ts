import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  //changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = 'piano-ml';
}
