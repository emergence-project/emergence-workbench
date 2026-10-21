import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from './contract/feedback.js'
import { agentTurns, feedbackBucket, userTurn } from './feedback-buckets.js'

// 피드백 규약의 공통 시험 사례 (docs/feedback/cases.json). 다른 앱의 차례 구현도 같은 파일을 돌린다
const file = new URL('../../../docs/feedback/cases.json', import.meta.url)
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
  now: string
  cases: { name: string; item: Partial<FeedbackItem>; bucket: string; user?: string; agent?: string[] }[]
}
const now = new Date(data.now).getTime()

describe('피드백 규약 공통 시험 사례', () => {
  for (const c of data.cases) {
    it(c.name, () => {
      const e = { time: '10:00', target: '부위', text: c.name, n: 1, key: c.name, ...c.item } as FeedbackItem
      expect(feedbackBucket(e, now)).toBe(c.bucket)
      expect(userTurn(e, now)).toBe(c.user ?? null)
      expect(agentTurns(e, now)).toEqual(c.agent ?? [])
    })
  }
})
