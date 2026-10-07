import type { Locale, ErrorCode } from '../../../shared/model'
import { supportedLanguages } from '../../../shared/languages'
import { en } from './locales/en'
import { zh } from './locales/zh-CN'
export type MessageKey = keyof typeof en
const resources: Record<Locale, Record<MessageKey, string>> = { en, 'zh-CN': zh }
export const languages = supportedLanguages.map((language) => ({
  ...language,
  messages: resources[language.code]
}))
export function translator(
  locale: Locale
): (key: MessageKey, params?: Record<string, string | number>) => string {
  const resource = languages.find((language) => language.code === locale)?.messages ?? en
  return (key, params = {}) => {
    const message =
      key === 'count' && locale === 'en' && params.n === 1 ? '{n} note' : (resource[key] ?? en[key])
    return message.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
  }
}
export function errorKey(code: ErrorCode): MessageKey {
  return (
    {
      storage: 'operationError',
      empty: 'empty',
      'too-long': 'tooLong',
      time: 'invalidTime',
      state: 'stateError',
      version: 'versionError',
      conflict: 'reportConflict',
      'directory-not-empty': 'directoryNotEmpty',
      'invalid-directory': 'invalidDirectory'
    } as const
  )[code]
}
