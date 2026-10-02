// Register supported interface languages here; message resources live in renderer/lib/locales.
export const supportedLanguages = [
  { code: 'en', name: 'English', systemPrefixes: ['en'] },
  { code: 'zh-CN', name: '简体中文', systemPrefixes: ['zh-cn', 'zh-hans', 'zh-sg'] }
] as const
export type Locale = (typeof supportedLanguages)[number]['code']
export function isLocale(value: string): value is Locale {
  return supportedLanguages.some((language) => language.code === value)
}
export function resolveLocale(preference: string | null, systemLocales: readonly string[]): Locale {
  if (preference !== null) return isLocale(preference) ? preference : 'en'
  for (const systemLocale of systemLocales) {
    const system = systemLocale.toLowerCase()
    const match = supportedLanguages.find((language) =>
      language.systemPrefixes.some((prefix) => system === prefix || system.startsWith(`${prefix}-`))
    )
    if (match) return match.code
  }
  return 'en'
}
