import assert from 'node:assert/strict';

Feature('Score page');

// The value shown next to a "Score information" label (labels are matched on their DOM text, not the
// upper-case rendering).
const field = label => ({
  xpath: `//p[contains(@class, "field-label")][normalize-space() = "${label}"]/following-sibling::*[1]`,
});
const practiceExercises = '//h3[normalize-space() = "Practice Exercises in this Scale"]/..';
// Explicit descendant XPaths: locate().inside() mis-combines containers that use a following-sibling step.
const linkIn = (containerXpath, text) => ({ xpath: `${containerXpath}//a[normalize-space() = "${text}"]` });

// Visitor opens a score page directly by its URL, checks its details, then goes to practice it.
Scenario('open happy birthday score page directly', async ({ I }) => {
  I.amOnPage('/score/hill-mildred-j-happy-birthday-to-you');
  I.waitForText('Happy Birthday to You', 15, 'h1');

  // Score information
  I.waitForText('Score information');
  for (const [label, value] of [
    ['Genre', 'folk'],
    ['Author', 'Mildred J. Hill'],
    ['Key', 'C major'],
    ['Grade', '1.389'],
    ['Duration', '0:30'],
    ['Tempo', '104'],
    ['Tracks', '2'],
    ['Measures', '17'],
    ['Public Domain', 'YES'], // rendered upper-case by CSS
    ['Uploaded', 'Sep 13, 2025'],
    ['Owner', 'Emmanuel Florent'],
  ]) {
    I.see(value, field(label));
  }
  I.seeElement(linkIn(field('MusicBrainz').xpath, 'Artist'));
  I.seeElement(linkIn(field('MusicBrainz').xpath, 'Work'));

  // Practice Exercises in this Scale
  const exercises = [
    'Arpeggio in root position, two octaves',
    'Two-octave Arpeggios, root, 1st and 2nd inversions',
    'Intervals',
    'Contrary motion starting on the same note.',
    'Left than Right',
    'Parallel motion in octaves',
    'Parallel motion in thirds',
    'Parallel motion in sixths',
    'Parallel motion in tenths',
  ];
  for (const exercise of exercises) {
    I.seeElement(linkIn(practiceExercises, exercise));
  }
  I.seeNumberOfVisibleElements({ xpath: `${practiceExercises}//a` }, exercises.length);

  // Video lessons: at least one (the section renders once the video API has answered)
  I.waitForElement('.video-lessons-section .carousel-item', 20);
  I.see('VIDEO LESSONS', '.video-lessons-section'); // rendered upper-case by CSS
  const videos = await I.grabNumberOfVisibleElements('.video-lessons-section .carousel-item');
  assert.ok(videos >= 1, `expected at least one video lesson, got ${videos}`);

  // From the score page the visitor can go practice it on the workbench
  I.click(locate('button').withText('Practice'));
  I.waitInUrl('/work/hill-mildred-j-happy-birthday-to-you');
  I.waitForElement('#osmdSvgPage1', 20); // sheet music rendered
  I.seeElement('#play-pause');
  // The page title switches from the generic site title once the score metadata is loaded
  I.waitForFunction(() => document.title.includes('Happy Birthday to You'), 15);
  I.seeInTitle('Mildred J. Hill - Happy Birthday to You');
});
