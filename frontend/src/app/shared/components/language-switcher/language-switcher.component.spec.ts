import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { setCurrentLocale } from '../../i18n';
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

  afterEach(() => {
    setCurrentLocale(undefined);
    TestBed.inject(DOCUMENT).cookie = 'lang=; Path=/; Max-Age=0';
  });

  it('links an English page to the same path in Spanish, named in Spanish', async () => {
    await open('/library/artists?page=2');
    expect(links()).toEqual([{ text: 'Español', href: '/es/library/artists?page=2', hreflang: 'es', lang: 'es' }]);
  });

  it('links a Spanish page back to the same path in English', async () => {
    setCurrentLocale('es');
    await open('/score/happy-birthday');
    expect(links()).toEqual([{ text: 'English', href: '/score/happy-birthday', hreflang: 'en', lang: 'en' }]);
  });

  it('follows navigation', async () => {
    await open('/library');
    await harness.navigateByUrl('/exercises');
    expect(links()[0].href).toBe('/es/exercises');
  });

  it('stores the chosen language in the lang cookie', async () => {
    await open('/');
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.language-link')!;
    link.addEventListener('click', (event) => event.preventDefault()); // stay on the test page
    link.click();
    expect(TestBed.inject(DOCUMENT).cookie).toContain('lang=es');
  });

  it('names each language in itself', () => {
    expect(nativeLanguageName('es')).toBe('Español');
    expect(nativeLanguageName('en')).toBe('English');
  });
});
