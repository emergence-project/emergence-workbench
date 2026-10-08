export const SHOTS_HELP = `Usage: pnpm shots [--viewport WIDTHxHEIGHT] [--theme mixed|light|dark] [--sample default|subjects] [--lang ko|en]

Defaults: --viewport 1200x735 --theme mixed --sample default --lang ko
  en: English screens on the English sample (.sandbox-en, fixtures/en overlay).
  mixed: default sample keeps its existing 52 light + 2 dark captures.
  light/dark: every screen uses the selected theme.
  subjects: separate taxonomy fixture, 10 screens.

SHOTS_DIR, SHOTS_PORT, SHOTS_SKIP_BUILD and CHROMIUM_PATH remain execution settings.
Legacy SHOTS_VIEWPORT/SHOTS_SCHEME/SHOTS_SUBJECTS are accepted; explicit CLI options win.
`

/** Parse all capture choices before building or starting the sandbox server. */
export function parseShotOptions(args = [], env = process.env) {
  const values = {
    viewport: env.SHOTS_VIEWPORT ?? '1200x735',
    theme: env.SHOTS_SCHEME === 'dark' ? 'dark' : 'mixed',
    sample: env.SHOTS_SUBJECTS === '1' ? 'subjects' : 'default',
    lang: env.SHOTS_LANG === 'en' ? 'en' : 'ko',
  }
  let help = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') { help = true; continue }
    if (arg === '--') continue // pnpm may forward the argument separator.
    const match = /^--(viewport|theme|sample|lang)(?:=(.*))?$/.exec(arg)
    if (!match) throw new Error(`Unknown shots option or argument: ${arg}`)
    const value = match[2] ?? args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for shots option --${match[1]}`)
    values[match[1]] = value
  }
  const size = /^([1-9]\d*)x([1-9]\d*)$/.exec(values.viewport)
  if (!size || !size.slice(1).every((n) => Number.isSafeInteger(Number(n)))) throw new Error('shots --viewport must be positive integer WIDTHxHEIGHT')
  if (!['mixed', 'light', 'dark'].includes(values.theme)) throw new Error('shots --theme must be mixed, light or dark')
  if (!['default', 'subjects'].includes(values.sample)) throw new Error('shots --sample must be default or subjects')
  if (!['ko', 'en'].includes(values.lang)) throw new Error('shots --lang must be ko or en')
  return { viewport: { width: Number(size[1]), height: Number(size[2]) }, theme: values.theme, sample: values.sample, lang: values.lang, help }
}

export function screenScheme(theme, name) {
  return theme === 'mixed' ? (name.startsWith('dark-') ? 'dark' : 'light') : theme
}
