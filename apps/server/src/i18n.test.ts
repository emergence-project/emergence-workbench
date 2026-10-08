import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Registry } from './registry.js'

const dirs: string[] = []
const configWith = (yaml: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-lang-'))
  dirs.push(dir)
  fs.writeFileSync(path.join(dir, 'config.yaml'), yaml)
  return dir
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('screen language setting', () => {
  it('keeps installs from before the language option in Korean', () => {
    expect(new Registry(configWith('researches:\n  - { id: a, path: /tmp/a }\nui:\n  theme: dark\n')).ui.language).toBe('ko')
    expect(new Registry(configWith('researches:\n  - { id: a, path: /tmp/a }\n')).ui.language).toBe('ko')
  })
  it('lets a fresh install follow the browser and keeps a saved choice', () => {
    expect(new Registry(configWith('researches: []\n')).ui.language).toBe('system')
    expect(new Registry(configWith('researches:\n  - { id: a, path: /tmp/a }\nui:\n  language: en\n')).ui.language).toBe('en')
  })
})
