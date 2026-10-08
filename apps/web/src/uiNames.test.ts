import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import table from './uiNames.en.json'

const SRC = path.dirname(new URL(import.meta.url).pathname)
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx$/.test(d.name) ? [path.join(dir, d.name)] : []))

describe('English names for screen parts (data-ui)', () => {
  const en: Record<string, string> = table
  it('has an English name for every fixed data-ui in the screen code', () => {
    const missing = new Set<string>()
    for (const f of files(SRC)) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/data-ui="([^"{]+)"/g)) {
        if (/[가-힣]/.test(m[1]!) && !(m[1]! in en)) missing.add(`${path.basename(f)}: ${m[1]}`)
      }
    }
    expect([...missing]).toEqual([])
  })
  it('English names carry no Korean', () => {
    expect(Object.entries(en).filter(([, v]) => /[가-힣]/.test(v))).toEqual([])
  })
})
