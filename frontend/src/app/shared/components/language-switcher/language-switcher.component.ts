import { DOCUMENT, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { type LocaleInfo, availableLocales, currentLocale, localizedPath } from '../../i18n';
import { langCookie } from '../../i18n/locale-negotiation';

/** A language's name in that language, capitalised: "English", "Español". */
export function nativeLanguageName(code: string): string {
  let name = code;
  try {
    name = new Intl.DisplayNames([code], { type: 'language' }).of(code) || code;
  } catch {
    // An engine without the data shows the code.
  }
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}

interface LanguageLink {
  code: string;
  name: string;
  href: string;
}

/**
 * Links to the current page in each other language. Every language is its own build, so these are plain
 * links (a full page load), not router links. Choosing one stores it in the `lang` cookie, which the
 * server follows when someone next opens `/`.
 */
@Component({
  selector: 'app-language-switcher',
  template: `
    <nav class="language-switcher" i18n-aria-label="@@languageSwitcher.label" aria-label="Language">
      @for (link of links(); track link.code) {
        <a class="language-link" [href]="link.href" [attr.hreflang]="link.code" [attr.lang]="link.code" (click)="choose(link.code)">
          {{ link.name }}
        </a>
      }
    </nav>
  `,
  styles: `
    .language-switcher { display: flex; gap: 0.75rem; }
    .language-link {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--color-neutral-400); text-decoration: none; transition: color 150ms;
    }
    .language-link:hover, .language-link:focus-visible { color: var(--color-neutral-200); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageSwitcherComponent {
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private readonly others: readonly LocaleInfo[] = availableLocales().filter(locale => locale.code !== currentLocale());

  readonly links = signal<LanguageLink[]>(this.linksFor(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(event => this.links.set(this.linksFor((event as NavigationEnd).urlAfterRedirects)));
  }

  /** Remembers the choice; the link itself then loads the page in that language. */
  choose(code: string): void {
    this.document.cookie = langCookie(code);
  }

  /** The same path, query included, in each other language: route segments are never translated. */
  private linksFor(url: string): LanguageLink[] {
    return this.others.map(locale => ({ code: locale.code, name: nativeLanguageName(locale.code), href: localizedPath(url, locale.code) }));
  }
}
