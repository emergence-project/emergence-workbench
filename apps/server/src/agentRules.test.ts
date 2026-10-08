// 에이전트 규칙 모음: 연구 저장소의 AGENTS.md · CLAUDE.md, 라이브러리 README의 개념노트 절
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { conceptRules, projectRules } from './agentRules.js'

let tmp: string
const dir = () => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-rules-')))
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('에이전트 규칙 모음', () => {
  it('AGENTS.md를 주고, @AGENTS.md만 가리키는 CLAUDE.md는 뺀다', () => {
    const d = dir()
    fs.writeFileSync(path.join(d, 'AGENTS.md'), '# AGENTS.md\n\n- Read STATUS.md first.\n')
    fs.writeFileSync(path.join(d, 'CLAUDE.md'), '@AGENTS.md\n')
    expect(projectRules(d)).toEqual([{ file: 'AGENTS.md', text: '# AGENTS.md\n\n- Read STATUS.md first.\n' }])
    fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# CLAUDE.md\n\nPropose first.\n')
    expect(projectRules(d).map((r) => r.file)).toEqual(['AGENTS.md', 'CLAUDE.md'])
  })

  it('규칙 파일이 없으면 빈 목록, 아주 길면 자른다', () => {
    const d = dir()
    expect(projectRules(d)).toEqual([])
    fs.writeFileSync(path.join(d, 'AGENTS.md'), 'x'.repeat(70 * 1024))
    const [r] = projectRules(d)
    expect(r!.truncated).toBe(true)
    expect(r!.text.length).toBe(64 * 1024)
  })

  it('README의 개념노트 절만, 그 절이 없으면 README 전체, 라이브러리가 없으면 null', () => {
    const d = dir()
    expect(conceptRules(undefined)).toBeNull()
    expect(conceptRules(d)).toBeNull()
    fs.writeFileSync(path.join(d, 'README.md'), '# lib\n\n## concepts/ — notes\n\nRule.\n')
    expect(conceptRules(d)).toEqual({ file: 'README.md', text: '## concepts/ — notes\n\nRule.' })
    fs.writeFileSync(path.join(d, 'README.md'), '# lib\n\nNo sections.\n')
    expect(conceptRules(d)!.text).toBe('# lib\n\nNo sections.\n')
  })
})
