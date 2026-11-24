import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, PLATFORM_ID, effect, inject, input } from '@angular/core';

/**
 * Scrolls the element into view when the bound value turns true: on a phone, the open tab of a tab bar that
 * scrolls sideways stays visible. 'nearest' leaves the page alone when the element is already in view.
 */
@Directive({ selector: '[appKeepInView]' })
export class KeepInViewDirective {
  readonly appKeepInView = input(false);

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      if (isBrowser && this.appKeepInView()) {
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        element.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  }
}
