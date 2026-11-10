Feature('Library search');

// A visitor goes from the homepage to the library through links, searches "happy birthday" and opens the
// first result. Keep scenario titles short: CodeceptJS names trace/screenshot files after them.
Scenario('search the library for happy birthday and open the first result', async ({ I }) => {
  // Homepage
  I.amOnPage('/');
  I.waitForText('A Machine to Learn Piano');
  I.see('Take a seat');
  I.see('Legal Notice');
  I.see('LOGIN'); // rendered upper-case by CSS; I.see matches what is displayed

  // Homepage -> summary -> library, through the links a visitor would use
  I.click('Take a seat');
  I.waitInUrl('/summary');
  I.waitForText('Browse library');
  I.seeElement(locate('a').withAttr({ href: '/exercises' }).withText('Start scales exercices'));
  for (const [href, title, cta] of [
    ['/library', 'Library', 'Open library'],
    ['/exercises', 'Exercises', 'Scales & exercises'],
    ['/blog/methods', 'Études for Pianists', 'Browse collection'],
    ['/blog/thanks-and-acknowledgments', 'Acknowledgments', 'Read more'],
  ]) {
    I.seeElement(locate('a').withAttr({ href }).withText(title).withText(cta));
  }
  I.click('Browse library');
  I.waitInUrl('/library');

  // First visit: the library guided tour opens; close it
  I.waitForText('Welcome to the library');
  I.click(locate('button').withAttr({ 'aria-label': 'Close' }));
  I.waitForInvisible('.beacon-tooltip-close');

  // Library controls (the tabs are only shown until a search runs)
  I.seeElement(locate('#browse-search-keyword').withAttr({ placeholder: 'Search scores by title, artist, or genre...' }));
  I.seeElement('#browse-grade-range');
  I.see('One hand');
  I.see('Two hands');
  I.seeNumberOfVisibleElements('input[type="checkbox"]', 2);
  I.seeElement('#browse-tonality');
  I.see('All keys', '#browse-tonality');
  I.see('Import');
  for (const tab of ['New', 'Popular', 'Browse by Genres', 'Browse by Artist']) {
    I.seeElement(locate('button').withText(tab));
  }

  // Search
  I.fillField('#browse-search-keyword', 'happy birthday');
  I.pressKey('Enter');
  I.waitInUrl('search=happy'); // waitInUrl compares against the decoded URL
  I.waitForElement('table tbody tr');
  I.see('Happy Birthday', 'table tbody tr:first-child');

  // Open the first result
  const title = (await I.grabTextFrom('table tbody tr:first-child td:nth-child(3)')).trim();
  I.click('table tbody tr:first-child');
  I.waitInUrl('/score/');
  I.waitForText(title, 15, 'h1');
});
