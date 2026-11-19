// 논의에 답하는 처리 기록 (11/20): 그 전 처리를 전후 그림까지 revised로 옮기고 rework를 적어, 덮여 사라지거나 계속 에이전트 차례로 남지 않게
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listAllFeedback, writeFeedbackAnswer } from './feedback.js'

const FIX = path.resolve(import.meta.dirname, '../../../fixtures/sandbox-feedback')
const KEY = '2026-10-04 14:10 피드백 › 피드백 묶음'
const statusOf = (dir: string) => YAML.parse(fs.readFileSync(path.join(dir, 'status.yaml'), 'utf8')) as Record<string, Record<string, unknown>>

describe('논의에 답하기 (writeFeedbackAnswer)', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-fbdiscuss-'))
    fs.cpSync(FIX, dir, { recursive: true })
    const status = statusOf(dir)
    status[KEY] = { ...status[KEY], state: '반영', note: '수정 완료 (#444)\n표에 결론 칸.', commit: '#444', pictures: ['444-전.png', '444-후.png'] }
    fs.writeFileSync(path.join(dir, 'status.yaml'), YAML.stringify(status))
    fs.appendFileSync(path.join(dir, 'reviews.yaml'), `${KEY}:\n  verdict: 논의\n  at: 2026-10-05T09:28\n  note: 따로 칸으로 두면?\n`)
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('그 전 처리를 전후 그림까지 revised로 옮기고 rework를 적는다', () => {
    writeFeedbackAnswer(dir, KEY, { state: '확인 필요', note: '확인 필요\n따로 두지 않는 것을 권한다.', ask: '처리 칸 하나로 둘까요?' }, 'claude', new Date(2026, 9, 21, 15, 15))
    const st = statusOf(dir)[KEY]!
    expect(st).toMatchObject({ state: '확인 필요', rework: '2026-10-05T09:28' })
    expect(st.pictures).toBeUndefined()
    expect((st.revised as Record<string, unknown>[]).at(-1)).toMatchObject({ at: '2026-10-05T09:28', note: '수정 완료 (#444)\n표에 결론 칸.', commit: '#444', pictures: ['444-전.png', '444-후.png'] })
    const e = listAllFeedback(dir).find((x) => x.key === KEY)!
    // 화면은 고친 이력에서 그 그림을 보인다 (경로는 pictures/ 안)
    expect(e.status!.revised!.at(-1)!.pictures).toEqual(['pictures/444-전.png', 'pictures/444-후.png'])
    // 답했으니 에이전트 차례가 아니다
    expect(e.status!.state).toBe('확인 필요')
    expect(e.status!.rework).toBe(e.review!.at)
  })
})
