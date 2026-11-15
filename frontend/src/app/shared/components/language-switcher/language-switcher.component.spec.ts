import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { availableLocales, setCurrentLocale } from '../../i18n';
import { langCookie } from '../../i18n/locale-negotiation';
import { LanguageSwitcherComponent, nativeLanguageName } from './language-switcher.component';

@Component({ template: '<app-language-switcher />', imports: [LanguageSwitcherComponent] })
class PageComponent {}

/** Links to the same page in each other language, remembering the choice in the lang cookie. */
describe('LanguageSwitcherComponent', () => {
  let harness: RouterTestingHarness;

  const links = () =>
    [...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a.language-link')].map((a) => ({
      text: a.textContent?.trim(),
      href: a.getAttribute('href'),
      hreflang: a.getAttribute('hreflang'),
      lang: a.getAttribute('lang'),
    }));

  async function open(url: string) {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: PageComponent }])] });
    harness = await RouterTestingHarness.create(url);
  }

  afterEach(() => setCurrentLocale(undefined));

  it('links an English page to the same path in every other language, each named in itself', async () => {
    await open('/library/artists?page=2');
    expect(links().map((link) => link.hreflang)).toEqual(availableLocales().filter((l) => l.code !== 'en').map((l) => l.code));
    expect(links()).toContainEqual({ text: 'Español', href: '/es/library/artists?page=2', hreflang: 'es', lang: 'es' });
    expect(links()).toContainEqual({ text: 'Français', href: '/fr/library/artists?page=2', hreflang: 'fr', lang: 'fr' });
    expect(links()).toContainEqual({ text: 'Italiano', href: '/it/library/artists?page=2', hreflang: 'it', lang: 'it' });
    expect(links()).toContainEqual({ text: '简体中文', href: '/zh/library/artists?page=2', hreflang: 'zh-Hans', lang: 'zh-Hans' });
  });

  it('links a Spanish page back to the same path in English, and not to itself', async () => {
    setCurrentLocale('es');
    await open('/score/happy-birthday');
    expect(links()).toContainEqual({ text: 'English', href: '/score/happy-birthday', hreflang: 'en', lang: 'en' });
    expect(links().map((link) => link.hreflang)).not.toContain('es');
  });

  it('follows navigation', async () => {
    await open('/library');
    await harness.navigateByUrl('/exercises');
    expect(links().find((link) => link.hreflang === 'es')?.href).toBe('/es/exercises');
  });

  it('stores the chosen language in the lang cookie', async () => {
    await open('/');
    // Spied rather than read back: spec files run side by side on one origin, sharing the real cookie jar.
    const setCookie = vi.spyOn(TestBed.inject(DOCUMENT), 'cookie', 'set').mockImplementation(() => undefined);
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.language-link[hreflang="es"]')!;
    link.addEventListener('click', (event) => event.preventDefault()); // stay on the test page
    link.click();
    expect(setCookie).toHaveBeenCalledWith(langCookie('es'));
    setCookie.mockRestore();
  });

  it('shows the current language, and closes on a click elsewhere or Escape', async () => {
    await open('/');
    const menu = harness.routeNativeElement!.querySelector<HTMLDetailsElement>('details.language-menu')!;
    expect(menu.querySelector('.language-current .name')?.textContent?.trim()).toBe('English');
    expect(menu.querySelector('.language-current .code')?.textContent?.trim()).toBe('en');
    menu.open = true;
    document.body.click();
    expect(menu.open).toBe(false);
    menu.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.open).toBe(false);
  });

  it('shows the language alone as the short code on phones', async () => {
    setCurrentLocale('zh-Hans');
    await open('/');
    expect(harness.routeNativeElement!.querySelector('.language-current .code')?.textContent?.trim()).toBe('zh');
    expect(harness.routeNativeElement!.querySelector('.language-current .name')?.textContent?.trim()).toBe('简体中文');
  });

  it('names each language in itself', () => {
    expect(nativeLanguageName('es')).toBe('Español');
    expect(nativeLanguageName('en')).toBe('English');
    expect(nativeLanguageName('fr')).toBe('Français');
    expect(nativeLanguageName('it')).toBe('Italiano');
    expect(nativeLanguageName('zh-Hans')).toBe('简体中文');
  });
});
