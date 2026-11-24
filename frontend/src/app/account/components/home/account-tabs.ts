/**
 * Tabs of the account page, in display order. Each is a child route of /account (/account/playlists…), its label also
 * the breadcrumb; its icon is registered by the account home component.
 */
export const ACCOUNT_TABS = [
  { path: 'practice', icon: 'piano', label: $localize`:@@accountHome.practice:Practice` },
  { path: 'playlists', icon: 'bootstrapHeart', label: $localize`:@@accountHome.myPlaylists:My Playlists` },
  { path: 'scores', icon: 'bootstrapMusicNote', label: $localize`:@@accountHome.myScores:My Scores` },
  { path: 'ai', icon: 'aiRectangle', label: $localize`:@@accountHome.tab.ai:AI` },
  { path: 'me', icon: 'bootstrapPerson', label: $localize`:@@accountHome.tab.myAccount:My Account` },
] as const;

export type AccountTabPath = (typeof ACCOUNT_TABS)[number]['path'];

export const accountTabLabel = (path: AccountTabPath) => ACCOUNT_TABS.find(tab => tab.path === path)!.label;
