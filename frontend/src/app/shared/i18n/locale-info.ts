/** One language the app is built in, as declared in the `i18n` section of angular.json. */
export interface LocaleInfo {
  /** BCP 47 code, also the `hreflang` value: `en`, `es`. */
  code: string;
  /** URL prefix without slashes, `''` for the source locale served at the root. */
  subPath: string;
  /** Open Graph locale: `en_US`, `es_ES`. */
  ogLocale: string;
}
