import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { editResearchYaml, researchHash } from './researchYaml.js'
import { app, useSampleApp } from './testkit.js'

useSampleApp()

describe('editResearchYaml', () => {
  const wb = () => app.registry.get('sample-research')

  it('keeps comments and other fields, and skips the write when nothing changes', () => {
    const f = wb().researchPath
    fs.writeFileSync(f, `${fs.readFileSync(f, 'utf8')}# 사람이 쓴 주석\nextra: [a, b]\n`)
    const before = fs.statSync(f).mtimeMs
    editResearchYaml(wb(), () => false)
    editResearchYaml(wb(), () => undefined, { flowCollectionPadding: false, lineWidth: 0 })
    expect(fs.statSync(f).mtimeMs).toBe(before)
    const hash = researchHash(wb())
    editResearchYaml(wb(), (doc) => { doc.set('latex-template', 'x') })
    const text = fs.readFileSync(f, 'utf8')
    expect(text).toContain('# 사람이 쓴 주석')
    expect(text).toContain('latex-template: x')
    expect(researchHash(wb())).not.toBe(hash)
  })

  it('refuses a file it cannot read or that is not a map', () => {
    const f = wb().researchPath
    for (const bad of ['a: [1\n', '- just\n- a list\n']) {
      fs.writeFileSync(f, bad)
      expect(() => editResearchYaml(wb(), (doc) => { doc.set('k', 1) })).toThrow(expect.objectContaining({ status: 409 }))
      expect(fs.readFileSync(f, 'utf8')).toBe(bad)
    }
  })
})
