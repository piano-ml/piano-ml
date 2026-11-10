Feature('Library search');

// A visitor goes from the homepage to the library through links, searches "happy birthday" and opens the
// first result. Keep scenario titles short: CodeceptJS names trace/screenshot files after them.
Scenario('search the library for happy birthday and open the first result', async ({ I }) => {
  // Homepage
  I.amOnPage('/');
  I.waitForText('A Machine to Learn Piano');

  // Homepage -> summary -> library, through the links a visitor would use
  I.click('Take a seat');
  I.waitInUrl('/summary');
  I.click('Browse library');
  I.waitInUrl('/library');

  // First visit: the library guided tour opens; close it
  I.waitForText('Welcome to the library');
  I.click(locate('button').withAttr({ 'aria-label': 'Close' }));
  I.waitForInvisible('.beacon-tooltip-close');

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
