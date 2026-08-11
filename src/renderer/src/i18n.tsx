/**
 * Renderer-side i18n wiring: a React context carrying the active language and
 * a `useT()` hook that returns a translation function (with {placeholder}
 * substitution). The provider value comes from the persisted app settings.
 */
import { createContext, useContext } from 'react'
import { translate, type Language, type TranslationKey } from '../../shared/i18n'

export type { TranslationKey }

const I18nContext = createContext<Language>('en')

export const I18nProvider = I18nContext.Provider

/** Translation function bound to the active language. */
export type TFunc = (key: TranslationKey, vars?: Record<string, string | number>) => string

/** Returns a translate() bound to the current language from context. */
export function useT(): TFunc {
  const lang = useContext(I18nContext)
  return (key, vars) => translate(lang, key, vars)
}
