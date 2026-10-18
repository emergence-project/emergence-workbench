import { afterEach, describe, expect, it, vi } from 'vitest'

import { kindLabel, stateLabel } from './recordLabels'

const screen = vi.hoisted(() => ({ lang: 'ko' as 'ko' | 'en' }))
vi.mock('./i18n', () => ({ t: (ko: string, en: string) => (screen.lang === 'ko' ? ko : en) }))

describe('기록 종류·상태 이름', () => {
  afterEach(() => { screen.lang = 'ko' })

  it('한국어 화면은 파일 값 그대로', () => {
    for (const k of ['전체', '자동', '메모', '할 일', '질문', '지시', '코멘트', '하이라이트', '판단', '맡긴 일']) expect(kindLabel(k)).toBe(k)
    for (const s of ['대기', '답함']) expect(stateLabel(s)).toBe(s)
    // 파일 값 끝냄은 화면에서 완료 (10/18)
    expect(stateLabel('끝냄')).toBe('완료')
  })

  it('영어 화면은 한 표에서 (끝냄은 어디서나 Done)', () => {
    screen.lang = 'en'
    expect(kindLabel('할 일')).toBe('To-do')
    expect(kindLabel('맡긴 일')).toBe('Delegated')
    expect(kindLabel('하이라이트')).toBe('Highlight')
    expect(stateLabel('끝냄')).toBe('Done')
    expect(stateLabel('답함')).toBe('Answered')
    // 모르는 값은 그대로
    expect(kindLabel('새 종류')).toBe('새 종류')
  })
})
