/** Tabs of the account page, in display order. Each is a child route of /account (/account/playlists…), its label also the breadcrumb. */
export const ACCOUNT_TABS = [
  { path: 'practice', label: $localize`:@@accountHome.practice:Practice` },
  { path: 'playlists', label: $localize`:@@accountHome.myPlaylists:My Playlists` },
  { path: 'scores', label: $localize`:@@accountHome.myScores:My Scores` },
  { path: 'ai', label: $localize`:@@accountHome.tab.ai:AI` },
  { path: 'me', label: $localize`:@@accountHome.tab.myAccount:My Account` },
] as const;

export type AccountTabPath = (typeof ACCOUNT_TABS)[number]['path'];

export const accountTabLabel = (path: AccountTabPath) => ACCOUNT_TABS.find(tab => tab.path === path)!.label;
