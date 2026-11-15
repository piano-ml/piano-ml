import assert from 'node:assert/strict';

Feature('Languages');

const SCORE = '/score/hill-mildred-j-happy-birthday-to-you';

/** The page's canonical and hreflang links, as `hreflang href` lines. */
async function seoLinks(I) {
  return I.executeScript(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(
      (link) => `${link.getAttribute('hreflang')} ${link.getAttribute('href')}`,
    ),
  }));
}

// Spanish is served under /es/ with the same paths; English stays at the root.
Scenario('the Spanish site, its language links and its web app manifest', async ({ I }) => {
  I.amOnPage('/es/');
  I.seeAttributesOnElements('html', { lang: 'es' });
  // The language menu: closed at first, it lists the other languages once opened.
  I.click('summary.language-current');
  I.seeElement({ xpath: '//a[contains(@class, "language-link")][@hreflang="en"][@href="/"]' });

  // A score page in Spanish points to itself, with the English version and x-default as alternates.
  I.amOnPage(`/es${SCORE}`);
  I.waitForText('Happy Birthday to You', 15, 'h1');
  const { canonical, alternates } = await seoLinks(I);
  assert.equal(canonical, `https://pianoml.org/es${SCORE}`);
  // One alternate per language (however many are built) plus x-default, each the same path under its prefix.
  for (const expected of [`en https://pianoml.org${SCORE}`, `es https://pianoml.org/es${SCORE}`, `x-default https://pianoml.org${SCORE}`]) {
    assert.ok(alternates.includes(expected), `missing alternate: ${expected}`);
  }
  for (const alternate of alternates) {
    assert.match(alternate, new RegExp(`^[\\w-]+ https://pianoml\\.org(/[\\w-]+)?${SCORE}$`));
  }
  assert.equal(new Set(alternates.map((a) => a.split(' ')[0])).size, alternates.length, 'one alternate per language');

  // The switcher goes back to the same path in English. A plain link (each language is its own build):
  // dispatched directly, since the first-visit guided tour may cover the header.
  await I.usePlaywrightTo('switch to English', async ({ page }) => {
    await Promise.all([page.waitForURL(`**${SCORE}`), page.locator('a.language-link[hreflang="en"]').dispatchEvent('click')]);
  });
  I.seeInCurrentUrl(SCORE);
  I.dontSeeInCurrentUrl('/es/');
  I.seeAttributesOnElements('html', { lang: 'en' });

  // The installable app: one manifest per language, with 3 shortcuts in that language.
  const manifest = await I.executeScript(() => fetch('/manifest.es.webmanifest').then((response) => response.json()));
  assert.equal(manifest.lang, 'es');
  assert.equal(manifest.start_url, '/es/');
  assert.deepEqual(manifest.shortcuts.map((shortcut) => [shortcut.name, shortcut.url]), [
    ['Inicio', '/es/'],
    ['Explorar', '/es/library'],
    ['Ejercicios', '/es/exercises'],
  ]);
});
