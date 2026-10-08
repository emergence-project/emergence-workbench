import { describe, expect, it } from 'vitest'
import {
  appendJournalEntry, buildTree, parseBlock, parseInline, parseJournal, parseMemo, setTodoDone, editJournalEntry, suggestBlockId, updateBlockMeta,
  type BlockMeta, type MemoBlock, type MetaPatch,
} from './index.js'

const sample = [
  '% ---',
  '% id: kempe-chains',
  '% title: Kempe 사슬 이용',
  '% status: in-progress',
  '% 사람이 쓴 설명 줄',
  '% parent: five-color',
  '% alternatives: [discharging, other-try]',
  '% custom-key: 보존되어야 함',
  '% ---',
  '\\section{본문}',
  '수식 $x$와 한글. 끝 공백   ',
  '',
].join('\n')

const bodyOf = (s: string) => s.slice(parseBlock(s).bodyStart)

describe('parseBlock', () => {
  it('머리말의 값과 본문 시작 위치를 읽는다', () => {
    const p = parseBlock(sample)
    expect(p.hasHeader).toBe(true)
    expect(p.meta).toMatchObject({
      id: 'kempe-chains', title: 'Kempe 사슬 이용', status: 'in-progress', parent: 'five-color',
      alternatives: ['discharging', 'other-try'], extra: { 'custom-key': '보존되어야 함' },
    })
    expect(p.bodyStartLine).toBe(10)
    expect(bodyOf(sample).startsWith('\\section{본문}')).toBe(true)
  })

  it('머리말이 없거나 닫히지 않았으면 본문 전체로 본다', () => {
    expect(parseBlock('\\section{x}\n').hasHeader).toBe(false)
    expect(parseBlock('% ---\n% id: a\n\\section{x}\n').hasHeader).toBe(false)
  })
})

describe('updateBlockMeta — 본문 무손실', () => {
  const patches: MetaPatch[] = [
    { status: 'blocked', 'blocked-reason': '보조정리 없음', 'resume-condition': '부록 확인' },
    { status: null },
    { alternatives: ['a', 'b'] },
    { title: '새 제목\n두 줄', next: '다음 할 일' },
    { parent: null, 'custom-key': null } as MetaPatch,
  ]

  for (const [i, patch] of patches.entries()) {
    it(`고친 뒤에도 본문 바이트가 같다 (${i + 1})`, () => {
      const out = updateBlockMeta(sample, patch)
      expect(bodyOf(out)).toBe(bodyOf(sample))
    })
  }

  it('여러 번 연달아 고쳐도 본문이 같고, 고치지 않은 머리말 줄도 그대로다', () => {
    let s = sample
    for (const p of patches) s = updateBlockMeta(s, p)
    expect(bodyOf(s)).toBe(bodyOf(sample))
    expect(s).toContain('% 사람이 쓴 설명 줄\n')
    expect(s).toContain('% id: kempe-chains\n')
  })

  it('값을 바꾸면 그 줄 자리에서 바뀌고, 없던 키는 닫는 줄 앞에 추가된다', () => {
    const out = updateBlockMeta(sample, { status: 'solved', next: '정리하기' })
    const lines = out.split('\n')
    expect(lines[3]).toBe('% status: solved')
    expect(lines[lines.indexOf('% ---', 1) - 1]).toBe('% next: 정리하기')
    expect(parseBlock(out).meta.title).toBe('Kempe 사슬 이용')
  })

  it('null이면 줄을 지우고, 여러 줄 값은 한 줄로 만든다', () => {
    const out = updateBlockMeta(sample, { parent: null, title: '가\n나' })
    expect(parseBlock(out).meta.parent).toBeUndefined()
    expect(parseBlock(out).meta.title).toBe('가 나')
  })

  it('CRLF 파일과 끝 줄바꿈 없는 파일도 본문을 보존한다', () => {
    const crlf = sample.replace(/\n/g, '\r\n').replace(/\r\n$/, '')
    const out = updateBlockMeta(crlf, { status: 'solved', next: '새 줄' })
    expect(bodyOf(out)).toBe(bodyOf(crlf))
    expect(out.slice(0, parseBlock(out).bodyStart)).not.toMatch(/[^\r]\n/)
  })

  it('머리말이 없으면 맨 위에 새로 만들고 원래 내용은 그대로 뒤에 둔다', () => {
    const plain = '\\section{x}\n본문\n'
    const out = updateBlockMeta(plain, { id: 'x', title: '엑스', alternatives: [] })
    expect(out.endsWith(plain)).toBe(true)
    expect(parseBlock(out).meta).toMatchObject({ id: 'x', title: '엑스', alternatives: [] })
  })
})

describe('buildTree', () => {
  const m = (partial: Partial<BlockMeta>): BlockMeta => ({ alternatives: [], extra: {}, ...partial })
  const blocks = [
    { id: 'axioms', meta: m({ status: 'solved', created: '2026-09-12' }) },
    { id: 'convex', meta: m({ status: 'solved', parent: 'axioms', created: '2026-09-18' }) },
    { id: 'boundary', meta: m({ status: 'stopped', parent: 'axioms', stoppedReason: '범위 밖', created: '2026-09-20' }) },
    { id: 'five', meta: m({ status: 'in-progress', parent: 'convex', created: '2026-09-21' }) },
    { id: 'modular', meta: m({ status: 'in-progress', parent: 'convex', created: '2026-09-22' }) },
    { id: 'low', meta: m({ status: 'blocked', parent: 'five', alternatives: ['kempe'], blockedReason: 'x', resumeCondition: 'y', created: '2026-09-25' }) },
    { id: 'kempe', meta: m({ status: 'in-progress', parent: 'five', alternatives: ['low'], created: '2026-09-26' }) },
  ]

  it('뿌리·자식·펼친 순서·상태 수를 계산한다', () => {
    const t = buildTree(blocks)
    expect(t.roots).toEqual(['axioms'])
    expect(t.children.axioms).toEqual(['convex', 'boundary'])
    expect(t.order.map((o) => `${o.depth}:${o.id}`)).toEqual(['0:axioms', '1:convex', '2:five', '3:low', '3:kempe', '2:modular', '1:boundary'])
    expect(t.counts).toEqual({ 'in-progress': 3, blocked: 1, stopped: 1, solved: 2 })
    expect(t.issues).toEqual([])
  })

  it('양쪽에 적힌 다른 시도는 한 쌍으로 합친다', () => {
    expect(buildTree(blocks).alternatives).toEqual([['kempe', 'low']])
  })

  it('이어서 할 것은 아래에 진행 중인 블록이 없는 진행 중 블록이다', () => {
    expect(buildTree(blocks).frontier).toEqual(['kempe', 'modular'])
  })

  it('없는 부모, 고리, 이유 없는 막힘을 문제로 알리고 나무는 계속 만든다', () => {
    const t = buildTree([
      { id: 'a', meta: m({ parent: 'b' }) },
      { id: 'b', meta: m({ parent: 'a' }) },
      { id: 'c', meta: m({ parent: 'nowhere', status: 'blocked' }) },
      { id: 'd', meta: m({ id: 'different', status: 'weird' }) },
    ])
    expect(t.issues).toEqual(expect.arrayContaining([
      { kind: 'cycle', id: 'a' },
      { kind: 'missing-parent', id: 'c', parent: 'nowhere' },
      { kind: 'blocked-without-reason', id: 'c' },
      { kind: 'id-mismatch', id: 'd', headerId: 'different' },
      { kind: 'bad-status', id: 'd', status: 'weird' },
    ]))
    expect(t.order).toHaveLength(4)
  })
})

describe('일지', () => {
  it('덧붙이고 다시 읽으면 같은 기록이 나온다', () => {
    let md = ''
    md = appendJournalEntry(md, { date: '2026-09-30', time: '09:40', kind: 'status', target: 'low', text: '진행 중 → 막힘' })
    md = appendJournalEntry(md, { date: '2026-09-30', time: '11:20', kind: 'todo', target: 'kempe', text: '유일성 조건 적기' })
    md = appendJournalEntry(md, { date: '2026-09-30', time: '15:02', kind: 'memo', target: '연구', text: '첫 줄\n둘째 줄 $x$' })
    expect(md.startsWith('# 2026-09-30\n')).toBe(true)
    expect(parseJournal(md, '2026-09-30')).toEqual([
      { date: '2026-09-30', time: '09:40', kind: 'status', target: 'low', text: '진행 중 → 막힘', index: 0 },
      { date: '2026-09-30', time: '11:20', kind: 'todo', target: 'kempe', text: '유일성 조건 적기', done: false, index: 1 },
      { date: '2026-09-30', time: '15:02', kind: 'memo', target: '연구', text: '첫 줄\n둘째 줄 $x$', index: 2 },
    ])
  })

  it('할 일 완료 표시는 그 줄의 [ ]만 바꾼다', () => {
    const md = appendJournalEntry(appendJournalEntry('', { date: 'd', time: '10:00', kind: 'memo', target: '연구', text: '- [ ] 메모 속 체크 모양' }),
      { date: 'd', time: '11:00', kind: 'todo', target: 'b', text: '할 일' })
    const done = setTodoDone(md, 1, true)
    expect(done).toBe(md.replace('- [ ] 할 일', '- [x] 할 일'))
    expect(parseJournal(done, 'd')[1]!.done).toBe(true)
    expect(() => setTodoDone(md, 0, true)).toThrow()
  })

  it('메모·할 일의 글만 고치거나 기록째 지운다', () => {
    let md = appendJournalEntry('', { date: 'd', time: '09:00', kind: 'status', target: 'a', text: '진행 → 막힘' })
    md = appendJournalEntry(md, { date: 'd', time: '10:00', kind: 'todo', target: '연구', text: '할 일' })
    md = appendJournalEntry(md, { date: 'd', time: '11:00', kind: 'memo', target: '연구', text: '메모\n둘째 줄' })
    const done = setTodoDone(md, 1, true)
    const e1 = editJournalEntry(done, 1, '고친 할 일')
    expect(parseJournal(e1, 'd').map((e) => [e.text, e.done])).toEqual([['진행 → 막힘', undefined], ['고친 할 일', true], ['메모\n둘째 줄', undefined]])
    expect(editJournalEntry(md, 2, '새 메모')).toBe(md.replace('메모\n둘째 줄', '새 메모'))
    expect(editJournalEntry(md, 1, null)).toBe(md.replace('\n## 10:00 · 할 일 · 연구\n- [ ] 할 일\n', ''))
    expect(editJournalEntry(md, 2, null)).toBe(md.replace('\n## 11:00 · 메모 · 연구\n메모\n둘째 줄\n', ''))
    expect(() => editJournalEntry(md, 0, 'x')).toThrow()
    expect(() => editJournalEntry(md, 1, '  ')).toThrow()
  })

  it('완료 기록을 읽고 쓴다', () => {
    const md = appendJournalEntry('', { date: '2026-10-01', time: '16:05', kind: 'done', target: 'kempe', text: '유일성 조건 적기' })
    expect(md).toBe('# 2026-10-01\n\n## 16:05 · 완료 · kempe\n유일성 조건 적기\n')
    expect(parseJournal(md, '2026-10-01')).toEqual([
      { date: '2026-10-01', time: '16:05', kind: 'done', target: 'kempe', text: '유일성 조건 적기', index: 0 },
    ])
  })

  it.each(['\n', '\r\n'])('완료 기록만 지우고 원래 할 일과 다른 기록의 바이트를 보존한다 (%j)', (eol) => {
    const before = ['# 2026-10-01', '', '## 10:00 · 할 일 · kempe', '- [x] 유일성 조건 적기  ', '', ''].join(eol)
    const completed = ['## 16:05 · 완료 · kempe', '유일성 조건 적기', '', ''].join(eol)
    const after = ['## 17:00 · 메모 · 연구', '에이전트가 덧붙인 메모  ', '두 번째 줄', ''].join(eol)
    const md = before + completed + after
    expect(editJournalEntry(md, 1, null)).toBe(before + after)
    expect(parseJournal(editJournalEntry(md, 1, null), '2026-10-01')[0]).toMatchObject({ kind: 'todo', done: true })
    expect(() => editJournalEntry(md, 1, '바꾼 완료 기록')).toThrow('완료 기록은 고칠 수 없음')
  })

  it('마지막 완료 기록은 지울 수 있지만 상태 기록은 고치거나 지울 수 없다', () => {
    const original = appendJournalEntry('', { date: '2026-10-01', time: '10:00', kind: 'status', target: 'kempe', text: '진행 → 해결' })
    const completed = appendJournalEntry(original, { date: '2026-10-01', time: '16:05', kind: 'done', target: 'kempe', text: '유일성 조건 적기' })
    expect(editJournalEntry(completed, 1, null)).toBe(original)
    expect(() => editJournalEntry(completed, 0, null)).toThrow('상태 기록은 고치거나 지울 수 없음')
    expect(() => editJournalEntry(completed, 0, '다른 상태')).toThrow('상태 기록은 고치거나 지울 수 없음')
  })

  it('사람이 손으로 쓴 형식도 읽는다', () => {
    const md = '# 2026-10-01\n\n## 9:05 · 메모 · 연구\n손으로 쓴 메모\n\n## 메모 아닌 제목\n무시\n'
    expect(parseJournal(md, '2026-10-01')).toEqual([
      { date: '2026-10-01', time: '09:05', kind: 'memo', target: '연구', text: '손으로 쓴 메모', index: 0 },
    ])
  })
})

describe('suggestBlockId', () => {
  const d = new Date(2026, 8, 30)
  it('영문 단어로 id를 만들고, 한글 제목은 날짜로 만든다', () => {
    expect(suggestBlockId('Five color 재유도', [], d)).toBe('five-color')
    expect(suggestBlockId('강한 부가법칙으로 직접', [], d)).toBe('b-0930')
  })
  it('겹치면 번호를 붙인다', () => {
    expect(suggestBlockId('Kempe', ['kempe', 'kempe-2'], d)).toBe('kempe-3')
    expect(suggestBlockId('가나다', ['b-0930'], d)).toBe('b-0930-2')
  })
})

describe('메모 마크다운', () => {
  it('글머리·번호 목록과 들여쓰기, 문단을 나눈다', () => {
    const blocks = parseMemo('확인할 것\n- 첫째 $x$\n  - 하위 **중요**\n- 둘째\n\n1. 번호 하나\n2. 번호 둘\n다음 문단')
    expect(blocks.map((b) => b.kind)).toEqual(['para', 'list', 'list', 'para'])
    const bullets = blocks[1] as Extract<MemoBlock, { kind: 'list' }>
    expect(bullets.ordered).toBe(false)
    expect(bullets.items.map((i) => i.depth)).toEqual([0, 1, 0])
    expect(bullets.items[0]!.inline).toEqual([{ kind: 'text', text: '첫째 ' }, { kind: 'math', tex: 'x' }])
    expect(bullets.items[1]!.inline).toContainEqual({ kind: 'bold', text: '중요' })
    expect((blocks[2] as Extract<MemoBlock, { kind: 'list' }>).ordered).toBe(true)
  })

  it('수식 안의 *나 -는 목록·굵게로 읽지 않는다', () => {
    expect(parseInline('$a*b - c$ 와 `x**2`')).toEqual([
      { kind: 'math', tex: 'a*b - c' }, { kind: 'text', text: ' 와 ' }, { kind: 'code', text: 'x**2' },
    ])
    expect(parseMemo('$-x$ 는 음수').map((b) => b.kind)).toEqual(['para'])
  })
})

describe('Markdown 보조 노트 머리말', () => {
  const md = ['---', 'id: lemma-a', 'title: "보조정리: A"', 'status: in-progress', 'alternatives: [b, c]', 'custom: 남김', '---', '', '## 본문', '', '$x$', ''].join('\n')
  it('"---" 머리말을 읽고 본문은 그 아래부터', () => {
    const p = parseBlock(md)
    expect(p.hasHeader).toBe(true)
    expect(p.meta).toMatchObject({ id: 'lemma-a', title: '보조정리: A', status: 'in-progress', alternatives: ['b', 'c'], extra: { custom: '남김' } })
    expect(bodyOf(md)).toBe('\n## 본문\n\n$x$\n')
  })
  it('고쳐도 본문 바이트와 형식이 그대로', () => {
    const out = updateBlockMeta(md, { status: 'blocked', 'blocked-reason': '반례: n=3', title: null })
    expect(bodyOf(out)).toBe(bodyOf(md))
    expect(out).toContain('status: blocked\n')
    expect(out).toContain('blocked-reason: "반례: n=3"\n')
    expect(out).not.toContain('title:')
    expect(parseBlock(out).meta.blockedReason).toBe('반례: n=3')
  })
  it('머리말이 없으면 format에 맞게 새로 만든다', () => {
    expect(updateBlockMeta('본문\n', { id: 'x', alternatives: ['a, b'] }, 'md')).toBe('---\nid: x\nalternatives: ["a, b"]\n---\n본문\n')
    expect(updateBlockMeta('본문\n', { id: 'x' })).toBe('% ---\n% id: x\n% ---\n본문\n')
  })
})
