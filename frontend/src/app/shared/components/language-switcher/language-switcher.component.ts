import { DOCUMENT, ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { type LocaleInfo, availableLocales, currentLocale, localizedPath } from '../../i18n';
import { langCookie } from '../../i18n/locale-negotiation';

/** A language's name in that language, capitalised: "English", "Español", "简体中文". */
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
 * A menu of links to the current page in each other language, for any number of languages. A native
 * `<details>` disclosure, so it opens even before the app has hydrated. Every language is its own build:
 * the links are plain links (a full page load), not router links. Choosing one stores it in the `lang`
 * cookie, which the server follows when someone next opens `/`.
 */
@Component({
  selector: 'app-language-switcher',
  template: `
    <details #menu class="language-menu">
      <summary class="language-current" i18n-title="@@languageSwitcher.label" title="Language" [attr.lang]="current.code">
        <svg class="globe" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span class="name">{{ current.name }}</span>
        <span class="code">{{ current.short }}</span>
      </summary>
      <nav class="language-list" i18n-aria-label="@@languageSwitcher.label" aria-label="Language">
        @for (link of links(); track link.code) {
          <a class="language-link" [href]="link.href" [attr.hreflang]="link.code" [attr.lang]="link.code" (click)="choose(link.code)">
            {{ link.name }}
          </a>
        }
      </nav>
    </details>
  `,
  styles: `
    :host { position: relative; }
    .language-current {
      display: flex; align-items: center; gap: 0.375rem; cursor: pointer; list-style: none;
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--color-neutral-400); transition: color 150ms;
    }
    .language-current::-webkit-details-marker { display: none; }
    .language-current:hover, .language-current:focus-visible, .language-menu[open] .language-current { color: var(--color-neutral-200); }
    .globe { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }
    .code { display: none; }
    .language-list {
      position: absolute; right: 0; top: calc(100% + 0.5rem); z-index: 30; min-width: 9rem;
      display: flex; flex-direction: column; padding: 0.25rem 0;
      background: var(--color-black); border: 1px solid var(--color-neutral-700); border-radius: 0.125rem;
    }
    .language-link {
      padding: 0.5rem 0.875rem; font-size: 0.875rem; white-space: nowrap;
      color: var(--color-neutral-300); text-decoration: none;
    }
    .language-link:hover, .language-link:focus-visible { color: var(--color-white); background: var(--color-neutral-800); }
    /* Phones: the current language as a short code (EN, ES, ZH), so the header always fits. */
    @media (max-width: 639px) {
      .name { display: none; }
      .code { display: inline; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageSwitcherComponent {
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly others: readonly LocaleInfo[] = availableLocales().filter(locale => locale.code !== currentLocale());

  @ViewChild('menu') private menu?: ElementRef<HTMLDetailsElement>;

  /** `short` is the language alone (`zh` for `zh-Hans`), shown on phones. */
  readonly current = { code: currentLocale(), short: currentLocale().split('-')[0], name: nativeLanguageName(currentLocale()) };
  readonly links = signal<LanguageLink[]>(this.linksFor(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(event => {
        this.links.set(this.linksFor((event as NavigationEnd).urlAfterRedirects));
        this.close();
      });
  }

  /** Remembers the choice; the link itself then loads the page in that language. */
  choose(code: string): void {
    this.document.cookie = langCookie(code);
  }

  /** A click anywhere else closes the menu. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.menu?.nativeElement.open) this.menu.nativeElement.open = false;
  }

  /** The same path, query included, in each other language: route segments are never translated. */
  private linksFor(url: string): LanguageLink[] {
    return this.others.map(locale => ({ code: locale.code, name: nativeLanguageName(locale.code), href: localizedPath(url, locale.code) }));
  }
}
