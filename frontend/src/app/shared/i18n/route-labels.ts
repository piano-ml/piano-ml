/**
 * Breadcrumb labels of the top-level routes, shared by app.routes.ts and app.routes.browser.ts. Home,
 * Browse and Exercises are the reserved NAV messages (app-messages.ts).
 */
export const ROUTE_LABELS = {
  practice: $localize`:@@route.practice:Practice`,
  desktop: $localize`:@@route.desktop:Desktop`,
  workbench: $localize`:@@route.workbench:Workbench`,
  score: $localize`:@@route.score:Score`,
  reimport: $localize`:@@route.reimport:Re-import`,
  account: $localize`:@@route.account:Account`,
  blog: $localize`:@@route.blog:Blog`,
  import: $localize`:@@route.import:Import`,
  library: $localize`:@@route.library:Library`,
  summary: $localize`:@@route.summary:Summary`,
  error: $localize`:@@route.error:Error`,
  notFound: $localize`:@@route.notFound:Not found`,
  coachConnect: $localize`:@@route.coachConnect:Connect an AI coach`
} as const;
