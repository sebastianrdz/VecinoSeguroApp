import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import es from './es';

// v1 ships Spanish (Mexico) only, per product brief. The i18n-js instance is
// still driven by the device locale via expo-localization so additional
// locales can be added later without touching call sites.
export const i18n = new I18n({
  'es-MX': es,
  es: es,
});

i18n.defaultLocale = 'es-MX';
i18n.locale = getLocales()[0]?.languageTag ?? 'es-MX';
i18n.enableFallback = true;

/**
 * Typed translation lookup. Usage: `t('gate.openButton')`,
 * or with interpolation: `t('gate.rateLimitedMessage', { seconds: 5 })`.
 */
export function t(scope: string, options?: Record<string, unknown>): string {
  return i18n.t(scope, options);
}

export default i18n;
