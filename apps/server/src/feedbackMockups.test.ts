// 피드백 처리 · 답에 붙인 시안 (11/19): 작업 폴더 mockups/에서 feedback/pictures/로 옮겨 적고 status.yaml에 단다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { answerMockups, copyMockups, dropMockups, readMockups } from './feedbackMockups.js'
import { listAllFeedback, writeFeedbackAnswer } from './feedback.js'

const FIX = path.resolve(import.meta.dirname, '../../../fixtures/sandbox-feedback')
const NEW = '2026-10-04 13:05 노트 화면 › 본문'
const NOW = new Date(2026, 10, 19, 14, 32)

describe('피드백 시안', () => {
  let root: string
  let fb: string
  let wt: string
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-fbmockups-'))
    fb = path.join(root, 'feedback')
    wt = path.join(root, 'wt')
    fs.cpSync(FIX, fb, { recursive: true })
    fs.mkdirSync(path.join(wt, 'mockups'), { recursive: true })
    for (const f of ['2026-11-19-nav-tabs.png', '2026-11-19-nav-tabs.html', 'place.png', 'notes.txt']) fs.writeFileSync(path.join(wt, 'mockups', f), f)
  })
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('같은 이름의 그림과 html을 함께 옮기고, 이름 앞 날짜는 붙이는 시각으로 바꾼다', () => {
    const out = copyMockups(wt, fb, ['2026-11-19-nav-tabs', 'place.png'], NOW)
    expect(out.sort()).toEqual(['pictures/2026-11-19-1432-mockup-nav-tabs.html', 'pictures/2026-11-19-1432-mockup-nav-tabs.png', 'pictures/2026-11-19-1432-mockup-place.png'])
    expect(fs.readFileSync(path.join(fb, 'pictures/2026-11-19-1432-mockup-nav-tabs.html'), 'utf8')).toBe('2026-11-19-nav-tabs.html')
  })

  it('없는 시안은 있는 이름을 알려 주며 거절하고, 작업 폴더가 없는 대화는 시안을 붙이지 못한다', () => {
    expect(() => copyMockups(wt, fb, ['nope'], NOW)).toThrow(/2026-11-19-nav-tabs, place/)
    expect(() => answerMockups({ mockups: ['place'] }, undefined, fb)).toThrow(/작업 폴더|work folder/)
    expect(answerMockups({ state: '동의', note: 'x' }, undefined, fb)).toEqual({})
  })

  it('처리와 함께, 처리 뒤에 따로, 답에 붙이면 status.yaml에 쌓이고 화면 목록에 나온다', () => {
    const a = answerMockups({ state: '확인 필요', note: '시안 두 개', mockups: ['place'] }, wt, fb, NOW)
    writeFeedbackAnswer(fb, NEW, { state: '확인 필요', note: '시안 두 개', ...a }, 'claude', NOW)
    const more = answerMockups({ mockups: ['2026-11-19-nav-tabs.png'] }, wt, fb, NOW)
    writeFeedbackAnswer(fb, NEW, { ...more }, 'claude', NOW)
    const r = answerMockups({ replies: [{ to: '2026-10-04T13:30', note: '이것도', mockups: ['place'] }] }, wt, fb, NOW)
    writeFeedbackAnswer(fb, NEW, { ...r }, 'claude', NOW)
    const st = listAllFeedback(fb).find((e) => e.key === NEW)!.status!
    expect(st.mockups).toEqual(['pictures/2026-11-19-1432-mockup-place.png', 'pictures/2026-11-19-1432-mockup-nav-tabs.html', 'pictures/2026-11-19-1432-mockup-nav-tabs.png'])
    expect(st.replies?.at(-1)).toMatchObject({ note: '이것도', mockups: ['pictures/2026-11-19-1432-mockup-place.png'] })
    expect(YAML.parse(fs.readFileSync(path.join(fb, 'status.yaml'), 'utf8'))[NEW].state).toBe('확인 필요')
  })

  it('쓰지 않을 시안은 답에서만 떼고, 그림 파일 · 다른 칸은 그대로 둔다 (11/24)', () => {
    const file = path.join(fb, 'status.yaml')
    const before = YAML.parse(fs.readFileSync(file, 'utf8'))[NEW]
    expect(dropMockups(fb, NEW, ['nav-tabs'])).toBe(2)
    expect(dropMockups(fb, NEW, ['place.png'])).toBe(2) // 지금 처리와 답 replies 둘 다
    const after = YAML.parse(fs.readFileSync(file, 'utf8'))[NEW]
    expect(after.mockups).toBeUndefined()
    expect(after.replies.at(-1).mockups).toBeUndefined()
    expect({ ...after, replies: undefined }).toEqual({ ...before, mockups: undefined, replies: undefined })
    expect(after.replies.at(-1).note).toBe('이것도')
    expect(fs.existsSync(path.join(fb, 'pictures/2026-11-19-1432-mockup-place.png'))).toBe(true)
    expect(() => dropMockups(fb, NEW, ['place'])).toThrow(/시안|mockup/)
    expect(() => dropMockups(fb, '2026-01-01 00:00 없음', ['place'])).toThrow()
  })

  it('처리가 없는 항목에 시안만 보내면 거절한다', () => {
    const file = path.join(fb, 'status.yaml')
    const doc = YAML.parse(fs.readFileSync(file, 'utf8'))
    delete doc[NEW]
    fs.writeFileSync(file, YAML.stringify(doc))
    expect(() => writeFeedbackAnswer(fb, NEW, { mockups: ['pictures/x.png'] }, 'claude', NOW)).toThrow(/state/)
  })

  it('폴더 없이 이름만 적은 시안은 pictures/ 안으로 읽는다', () => {
    expect(readMockups(['a.png', 'pictures/b.html', '', 3])).toEqual(['pictures/a.png', 'pictures/b.html'])
    expect(readMockups('a.png')).toBeUndefined()
  })
})
