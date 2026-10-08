// 파일 쓰기 도우미: 심볼릭 링크를 따라 저장소 밖 파일을 고치지 않는다 (10/5 Codex 보안 검토)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeAtomic } from './fsutil.js'

describe('writeAtomic', () => {
  it('링크는 따라가지 않고 그 자리에 새 파일을 둔다 (STATUS.md → ~/.zshrc 같은 링크)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-fsutil-'))
    const outside = path.join(dir, 'zshrc')
    fs.writeFileSync(outside, 'export PATH=x\n')
    const link = path.join(dir, 'repo', 'STATUS.md')
    fs.mkdirSync(path.dirname(link))
    fs.symlinkSync(outside, link)
    writeAtomic(link, '# 상태\n')
    expect(fs.readFileSync(outside, 'utf8')).toBe('export PATH=x\n')
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(link, 'utf8')).toBe('# 상태\n')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('followLink가 허락한 곳만 링크를 따라 쓴다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-fsutil-'))
    const real = path.join(dir, 'export.bib')
    fs.writeFileSync(real, '')
    const link = path.join(dir, 'references.bib')
    fs.symlinkSync(real, link)
    writeAtomic(link, '@misc{a,}\n', { followLink: (r) => r.endsWith('.bib') })
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(real, 'utf8')).toBe('@misc{a,}\n')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
