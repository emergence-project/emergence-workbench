import { describe, expect, it } from 'vitest'
import { looksLikeRepoPath } from './repoPaths'

describe('기록 글 속 저장소 경로 (10/19)', () => {
  it('슬래시와 확장자가 있는 상대 경로만 링크로 본다', () => {
    expect(looksLikeRepoPath('GOVERNMENT/Working-Pad/project-review/2026-10-02-batch-review-guide.md')).toBe(true)
    expect(looksLikeRepoPath('./docs/x.tex')).toBe(true)
    for (const s of ['README.md', 'docs/reviews', '/etc/hosts.conf', 'https://a.b/c.md', 'a b/c.md', 'pnpm agent:records', 'x/y.']) expect(looksLikeRepoPath(s)).toBe(false)
  })
})
