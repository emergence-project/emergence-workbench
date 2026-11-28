import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isResearchWrite, mcpToolKinds, NOT_RESEARCH_WRITES } from './mcpToolKinds.js'

describe('앱 MCP 도구의 성격 표', () => {
  const kinds = mcpToolKinds()

  it('모든 도구가 읽기만 하는지 고치는지 밝힌다 (annotations.readOnlyHint)', () => {
    const unmarked = [...kinds].filter(([, k]) => k === 'unmarked').map(([n]) => n)
    expect(unmarked, '등록할 때 annotations에 readOnlyHint를 적는다').toEqual([])
  })

  it('본체 · 플러그인 · 앱 고치기 · 중앙 도구를 모두 본다', () => {
    for (const name of ['read_note', 'edit_note', 'add_task', 'problem_propose', 'app_submit', 'chat_open', 'central_help']) expect(kinds.has(name), name).toBe(true)
  })

  it('읽는 도구는 연구 쓰기가 아니고, 고치는 도구는 연구 쓰기다', () => {
    for (const name of ['read_note', 'list_records', 'problem_read', 'app_checks', 'chat_list']) expect(isResearchWrite(name), name).toBe(false)
    for (const name of ['edit_note', 'new_note', 'edit_concept', 'add_record', 'answer_record', 'add_task', 'add_journal', 'claim_add', 'attempt_record', 'problem_exception']) expect(isResearchWrite(name), name).toBe(true)
  })

  it('표에 없는 이름은 연구 쓰기로 본다 (모르면 막는 쪽)', () => {
    expect(isResearchWrite('tool_added_tomorrow')).toBe(true)
  })

  it('예외 목록은 실제로 있는 고치는 도구만 든다 (지운 도구 · 읽는 도구가 남지 않게)', () => {
    for (const name of NOT_RESEARCH_WRITES) expect(kinds.get(name), name).toBe('write')
  })

  // 도구를 등록하는 소스를 글로 읽는다: 표가 못 본 도구와, 읽기 표시를 달고 서버에 쓰는 도구를 잡는다
  const dir = path.dirname(new URL(import.meta.url).pathname)
  const blocks = fs.readdirSync(dir).filter((f) => /^mcp[A-Za-z]*\.ts$/.test(f) && !f.endsWith('.test.ts'))
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split(/\.registerTool\(/).slice(1))
    // 도구 하나의 몫은 그 등록이 닫히는 줄까지 (뒤따르는 도우미 함수는 뺀다)
    .map((b) => ({ name: /^\s*'([a-z_]+)'/.exec(b)?.[1], body: b.slice(0, (/^ {2,6}\}\)+$|\)\)$/m.exec(b)?.index ?? b.length) + 1) }))

  it('소스에 등록된 도구가 모두 표에 있다 (새 대화 종류에서만 나오는 도구를 빠뜨리지 않게, VARIANTS)', () => {
    expect(blocks.length).toBeGreaterThan(40)
    expect(blocks.filter((b) => !b.name).length, '도구 이름은 글자 그대로 적는다').toBe(0)
    expect(blocks.map((b) => b.name).filter((n) => n && !kinds.has(n))).toEqual([])
  })

  it('읽기만 한다고 밝힌 도구는 서버에 쓰지 않는다 (표시가 판정의 근거라서)', () => {
    const writes = /\b(post|write)\(/
    const wrong = blocks.filter((b) => b.name && kinds.get(b.name) === 'read' && writes.test(b.body.replace(/\/\/.*$/gm, ''))).map((b) => b.name)
    expect(wrong, '서버에 쓰는 도구는 readOnlyHint: false로 등록한다').toEqual([])
  })
})
