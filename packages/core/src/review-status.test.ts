import { describe, expect, it } from 'vitest'
import { awaitsUserReview } from './review-status.js'

describe('awaitsUserReview', () => {
  it('in-review와 그 옛 이름만 사용자 차례로 센다', () => {
    for (const s of ['in-review', 'In-Review', 'proposed', 'needs_review', 'needs-revision']) expect(awaitsUserReview(s)).toBe(true)
    for (const s of ['draft', 'in-progress', 'accepted', 'closed', 'superseded', '']) expect(awaitsUserReview(s)).toBe(false)
  })
})
