import { BeaconStep } from 'ng-beacon';

export const BROWSE_TOUR: BeaconStep[] = [
  {
    id: 'welcome',
    title: $localize`:@@browse.tour.welcome.title:Welcome to the library`,
    content: $localize`:@@browse.tour.welcome.content:On this search page you can filter scores in several ways.`,
    position: 'center',
    showWithoutTarget: true,
  },
  {
    id: 'grade-range',
    title: $localize`:@@browse.tour.grade.title:Grade range`,
    content: $localize`:@@browse.tour.grade.content:Select a grade range to filter the scores displayed in the library. You can adjust the sliders to set the minimum and maximum grade levels you want to include in your search results.`,
    position: 'below',
    selector: '#browse-grade-range',
  },
  {
    id: 'handedness',
    title: $localize`:@@browse.tour.handedness.title:Handedness`,
    content: $localize`:@@browse.tour.handedness.content:Use the checkboxes to filter scores based on handedness. Check "One hand" to include scores that can be played with one hand. Check "Two hands" to include scores that require two hands. You can select either or both options to refine your search results according to your preferences.`,
    position: 'below',
    selector: '#browse-handedness',
  },
  {
    id: 'tonality',
    title: $localize`:@@browse.tour.tonality.title:Tonality`,
    content: $localize`:@@browse.tour.tonality.content:Use the dropdown to filter scores based on their tonality. Select a specific key to include only scores in that key, or choose "All keys" to include scores in any key.`,
    position: 'below',
    selector: '#browse-tonality',
  },
  {
    id: 'search-keyword',
    title: $localize`:@@browse.tour.search.title:Search by keyword`,
    content: $localize`:@@browse.tour.search.content:Use the search bar to find scores by entering specific keywords. Type in the name of a composer, a piece, or any relevant term and press Enter to see the search results that match your query. This feature allows you to quickly locate scores based on specific criteria or interests.`,
    position: 'below',
    selector: '#browse-search-keyword',
  },
];