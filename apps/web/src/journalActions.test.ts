import { describe, expect, it } from 'vitest'
import { journalDeletePrompt, journalEntryActions } from './journalActions'

describe('일지 항목 행동', () => {
  it('완료 기록은 지우기만 하고 상태 기록에는 고치기와 지우기를 두지 않는다', () => {
    expect(journalEntryActions('done')).toEqual({ editable: false, deletable: true })
    expect(journalEntryActions('status')).toEqual({ editable: false, deletable: false })
    expect(journalEntryActions('memo')).toEqual({ editable: true, deletable: true })
    expect(journalEntryActions('todo')).toEqual({ editable: true, deletable: true })
  })

  it('완료 기록을 지울 때 되돌릴 수 없으며 원래 할 일의 완료 표시가 남음을 알린다', () => {
    const prompt = journalDeletePrompt({ kind: 'done', text: '첫 줄\n둘째 줄' })
    expect(prompt.title).toBe('이 완료 기록을 지울까요?')
    expect(prompt.hint).toContain('첫 줄 둘째 줄')
    expect(prompt.hint).toContain('되돌릴 수 없습니다')
    expect(prompt.hint).toContain('원래 할 일의 완료 표시')
    expect(prompt.hint).toContain('다른 일지 항목과 연결된 노트는 그대로 남습니다')
    expect(prompt.ok).toBe('지우기')
  })

  it('메모와 할 일의 지우기 확인도 보존되는 대상을 적는다', () => {
    for (const kind of ['memo', 'todo'] as const) {
      const prompt = journalDeletePrompt({ kind, text: '할 일의 앞뒤 기록' })
      expect(prompt.hint).toContain('다른 일지 항목과 연결된 노트는 그대로 남습니다')
      expect(prompt.hint).not.toContain('원래 할 일의 완료 표시')
    }
  })
})
