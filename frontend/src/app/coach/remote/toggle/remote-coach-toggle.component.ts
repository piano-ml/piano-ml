import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapFiletypeAi } from '@ng-icons/bootstrap-icons';
import { REMOTE_COACH_DOC, RemoteCoachService } from '../remote-coach.service';

/**
 * The Remote coach switch: in the site header (`header`), or as a 64 px tile in the workbench toolbar
 * (`workbench`). Emerald when on, orange (blinking) while connecting, orange when it could not connect, white when
 * off. Without a grant that can drive the player, a dimmed link to the blog post that presents the feature.
 */
@Component({
  selector: 'app-remote-coach-toggle',
  imports: [NgIcon, RouterLink],
  templateUrl: './remote-coach-toggle.component.html',
  styleUrl: './remote-coach-toggle.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ bootstrapFiletypeAi })],
})
export class RemoteCoachToggleComponent {
  readonly variant = input<'header' | 'workbench'>('header');

  protected readonly coach = inject(RemoteCoachService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly doc = REMOTE_COACH_DOC;
}
