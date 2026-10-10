import { describe, expect, it } from 'vitest'
import { changedEntries } from './feedback.js'

describe('올릴 피드백 수 (파일이 아니라 항목)', () => {
  it('날짜 파일은 새로 쓰거나 고친 항목만 센다', () => {
    const before = '# 2026-10-10\n\n## 12:00 · 질문 · 홈\n\n하나\n'
    const after = before + '\n## 13:00 · 수정 · 홈\n\n둘\n\n## 13:00 · 수정 · 홈\n\n셋\n'
    expect(changedEntries('feedback/2026-10-10.md', before, after)).toBe(2)
    expect(changedEntries('feedback/2026-10-10.md', before, before.replace('하나', '하나!'))).toBe(1)
    expect(changedEntries('feedback/2026-10-10.md', '', before)).toBe(1)
  })

  it('reviews.yaml은 답 · 코멘트가 바뀐 항목마다 센다', () => {
    const before = 'a:\n  verdict: 진행\nb:\n  comments: []\n'
    const after = 'a:\n  verdict: 승인\nb:\n  comments:\n    - note: 왜?\nc:\n  verdict: 승인\nd:\n  verdict: 승인\n'
    expect(changedEntries('feedback/reviews.yaml', before, after)).toBe(4)
    expect(changedEntries('feedback/reviews.yaml', before, before)).toBe(0)
  })

  it('읽을 수 없는 YAML과 그 밖의 파일은 하나로 센다', () => {
    expect(changedEntries('feedback/reviews.yaml', 'a: 1\n', 'a: [\n')).toBe(1)
    expect(changedEntries('feedback/notes.txt', 'a', 'b')).toBe(1)
  })
})
