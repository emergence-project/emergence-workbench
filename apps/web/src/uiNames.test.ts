import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import table from './uiNames.en.json'
import { koName } from './uiNames'

const SRC = path.dirname(new URL(import.meta.url).pathname)
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx$/.test(d.name) ? [path.join(dir, d.name)] : []))

describe('English names for screen parts (data-ui)', () => {
  const en: Record<string, string> = table
  it('has an English name for every fixed data-ui in the screen code', () => {
    const missing = new Set<string>()
    for (const f of files(SRC)) {
      const src = fs.readFileSync(f, 'utf8')
      // 고정 문자열 data-ui="…"과, 조건식 안의 문자열 리터럴 data-ui={a ? '…' : '…'} 둘 다 본다
      const names = [...src.matchAll(/data-ui="([^"{]+)"/g)]
      for (const m of src.matchAll(/data-ui=\{([^}\n]*)\}/g)) for (const lit of m[1]!.matchAll(/'([가-힣][^']*)'/g)) names.push(lit)
      for (const m of names) {
        if (/[가-힣]/.test(m[1]!) && !(m[1]! in en)) missing.add(`${path.basename(f)}: ${m[1]}`)
      }
    }
    expect([...missing]).toEqual([])
  })
  it('English names carry no Korean', () => {
    expect(Object.entries(en).filter(([, v]) => /[가-힣]/.test(v))).toEqual([])
  })
})

describe('Korean names for screen parts follow the term table', () => {
  it('shows the new name for an old one, and leaves other names alone', () => {
    expect(koName('왼쪽 띠')).toBe('레일')
    expect(koName('확인이 필요한 보조 노트')).toBe('확인이 필요한 노트')
    expect(koName('형광펜 단추')).toBe('하이라이트 버튼')
    expect(koName('작업 화면')).toBe('작업 화면')
    expect(koName('오른쪽 칸')).toBe('오른쪽 사이드바')
  })
})

