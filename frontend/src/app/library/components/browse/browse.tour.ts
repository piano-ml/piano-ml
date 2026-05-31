import { BeaconStep } from 'ng-beacon';

export const BROWSE_TOUR: BeaconStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the library',
    content: 'On this search page you can filter score by multiples aspects',
    position: 'center',
    showWithoutTarget: true,
  },
  {
    id: 'grade-range',
    title: 'Grade range',
    content: 'Select a grade range to filter the scores displayed in the library. You can adjust the sliders to set the minimum and maximum grade levels you want to include in your search results.',
    position: 'below',
    selector: '#browse-grade-range',
  },
  {
    id: 'handedness',
    title: 'Handedness',
    content: 'Use the checkboxes to filter scores based on handedness. Check "One Hand" to include scores that can be played with one hand. Check "Two Hand" to include scores that require two hands. You can select either or both options to refine your search results according to your preferences.',
    position: 'below',
    selector: '#browse-handedness',
  },
  {
    id: 'tonality',
    title: 'Tonality',
    content: 'Use the dropdown to filter scores based on their tonalty. Select a specific key to include only scores in that key, or choose "All keys" to include scores in any key.',
    position: 'below',
    selector: '#browse-tonality',
  },
  {
    id: 'search-keyword',
    title: 'Search by keyword',
    content: 'Use the search bar to find scores by entering specific keywords. Type in the name of a composer, a piece, or any relevant term and press Enter to see the search results that match your query. This feature allows you to quickly locate scores based on specific criteria or interests.',
    position: 'below',
    selector: '#browse-search-keyword',
  },
];