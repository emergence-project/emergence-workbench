// 노트 머리말의 주제·성격·설명·즐겨찾기 (10/5 주제·노트 결정)
import { describe, expect, it } from 'vitest'
import { parseBlock, parseList, updateBlockMeta } from './index.js'

const TEX = '% ---\n% id: a\n% title: A\n% status: in-progress\n% ---\n\\section{A}\n본문 % 주석\n'
const MD = '---\nid: a\ntitle: A\nstatus: in-progress\n---\n본문\n'

describe('여러 줄 설명', () => {
  it('LaTeX(%) 머리말은 따옴표 안 \\n 한 줄로 쓰고, 읽으면 여러 줄로 돌아온다. 본문과 다른 줄은 그대로', () => {
    const desc = '첫 줄\n- 둘째: "따옴표"\n- 셋째 % 퍼센트'
    const out = updateBlockMeta(TEX, { description: desc, topics: ['coloring', 'kempe'], kind: 'proof', star: 'true' })
    expect(out).toContain('% description: "첫 줄\\n- 둘째: \\"따옴표\\"\\n- 셋째 % 퍼센트"\n')
    expect(out).toContain('% topics: [coloring, kempe]\n% kind: proof\n% star: true\n% ---\n')
    expect(out.endsWith('\\section{A}\n본문 % 주석\n')).toBe(true)
    const { meta } = parseBlock(out)
    expect(meta.extra).toMatchObject({ description: desc, kind: 'proof', star: 'true' })
    expect(parseList(meta.extra.topics!)).toEqual(['coloring', 'kempe'])
    expect(meta.title).toBe('A')
    // 지우기
    const back = updateBlockMeta(out, { description: null, star: null, topics: null, kind: null })
    expect(back).toBe(TEX)
  })

  it('Markdown 머리말은 "|-" 블록 글로 쓰고, 고치거나 지울 때 이어지는 줄도 함께 바꾼다', () => {
    const out = updateBlockMeta(MD, { description: '첫 줄\n\n- 둘째', star: 'true' }, 'md')
    expect(out).toBe('---\nid: a\ntitle: A\nstatus: in-progress\ndescription: |-\n  첫 줄\n\n  - 둘째\nstar: true\n---\n본문\n')
    expect(parseBlock(out).meta.extra.description).toBe('첫 줄\n\n- 둘째')
    expect(parseBlock(out).meta.extra.star).toBe('true')
    const one = updateBlockMeta(out, { description: '한 줄: 설명' }, 'md')
    expect(one).toBe('---\nid: a\ntitle: A\nstatus: in-progress\ndescription: "한 줄: 설명"\nstar: true\n---\n본문\n')
    expect(parseBlock(one).meta.extra.description).toBe('한 줄: 설명')
    expect(updateBlockMeta(out, { description: null, star: null }, 'md')).toBe(MD)
  })

  it('사람이 YAML로 쓴 목록·블록 글도 읽는다 (topics 줄 목록, description |)', () => {
    const hand = '---\nid: a\ntitle: A\ntopics:\n  - coloring\n  - kempe\ndescription: |\n  - 첫째\n  - 둘째\nkind: check\n---\n본문\n'
    const { meta, bodyStart } = parseBlock(hand)
    expect(parseList(meta.extra.topics!)).toEqual(['coloring', 'kempe'])
    expect(meta.extra.description).toBe('- 첫째\n- 둘째')
    expect(meta.extra.kind).toBe('check')
    expect(hand.slice(bodyStart)).toBe('본문\n')
    // 줄 목록을 고쳐도 다른 줄은 그대로
    expect(updateBlockMeta(hand, { topics: ['kempe'] }, 'md')).toBe('---\nid: a\ntitle: A\ntopics: [kempe]\ndescription: |\n  - 첫째\n  - 둘째\nkind: check\n---\n본문\n')
  })
})
