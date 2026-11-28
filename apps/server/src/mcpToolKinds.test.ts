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
})
