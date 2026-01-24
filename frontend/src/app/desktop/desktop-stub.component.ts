import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Composant stub pour les routes desktop côté serveur
 * Ce composant ne fait rien, il sert juste à satisfaire l'extraction de routes SSR
 * Le vrai contenu sera rendu côté client grâce à RenderMode.Client
 */
@Component({
  selector: 'app-desktop-stub',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class DesktopStubComponent {}
