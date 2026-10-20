import { describe, expect, it } from 'vitest'
import { looksLikeRepoPath, replaceRecordPath } from './repoPaths'

describe('기록 글 속 저장소 경로 (10/19)', () => {
  it('슬래시와 확장자가 있는 상대 경로만 링크로 본다', () => {
    expect(looksLikeRepoPath('GOVERNMENT/Working-Pad/project-review/2026-10-02-batch-review-guide.md')).toBe(true)
    expect(looksLikeRepoPath('./docs/x.tex')).toBe(true)
    for (const s of ['README.md', 'docs/reviews', '/etc/hosts.conf', 'https://a.b/c.md', 'a b/c.md', 'pnpm agent:records', 'x/y.']) expect(looksLikeRepoPath(s)).toBe(false)
  })
})

describe('기록의 경로를 새 자리로 고치기', () => {
  it('`…`로 감싼 그 경로만 바꾸고, 그 경로를 품은 다른 경로는 그대로 둔다', () => {
    const body = '`notes/a.md`와 `old-notes/a.md`, 그리고 `./notes/a.md`를 본다. notes/a.md는 글'
    expect(replaceRecordPath(body, 'notes/a.md', 'topics/x/a.md')).toBe('`topics/x/a.md`와 `old-notes/a.md`, 그리고 `topics/x/a.md`를 본다. notes/a.md는 글')
    expect(replaceRecordPath('`old-notes/a.md`', 'notes/a.md', 'b.md')).toBeNull()
  })
})
