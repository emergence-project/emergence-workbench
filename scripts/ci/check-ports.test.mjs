import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPorts, parseGuide, portsIn } from './check-ports.mjs'

const GUIDE = '---\nabout:\n  - about/a.tsx\ncode:\n  - src/a.ts\n  - src/b.ts\n---\n\n# 안내서\n'
const base = () => ({
  guides: { chat: GUIDE },
  sections: { 'about/a.tsx': "title: 'A', port: 'chat',", 'about/b.tsx': "title: 'B'," },
  exists: () => true,
  index: '| 대화 | [chat.md](chat.md) |',
  indexSection: "{ name: 'chat' }",
})

test('안내서 머리의 about: · code: 목록을 읽는다', () => {
  assert.deepEqual(parseGuide(GUIDE), { about: ['about/a.tsx'], code: ['src/a.ts', 'src/b.ts'] })
  assert.equal(parseGuide('# 머리 없음'), null)
  assert.deepEqual([...portsIn("port: 'chat', x port: 'pdf-comments'")], ['chat', 'pdf-comments'])
})

test('짝 · 경로 · 목록이 맞으면 통과', () => {
  assert.deepEqual(checkPorts(base()), [])
})

test('짝이 어긋나면 막는다', () => {
  assert.equal(checkPorts({ ...base(), sections: { 'about/a.tsx': "title: 'A'," } }).length, 1)
  assert.equal(checkPorts({ ...base(), sections: { ...base().sections, 'about/b.tsx': "port: 'chat'" } }).length, 1)
  assert.equal(checkPorts({ ...base(), sections: { ...base().sections, 'about/b.tsx': "port: 'nope'" } }).length, 1)
})

test('없는 경로 · 목록에서 빠진 안내서 · 머리 없는 안내서를 막는다', () => {
  assert.equal(checkPorts({ ...base(), exists: (p) => p !== 'src/b.ts' }).length, 1)
  assert.equal(checkPorts({ ...base(), index: '' }).length, 1)
  assert.equal(checkPorts({ ...base(), indexSection: '' }).length, 1)
  assert.equal(checkPorts({ ...base(), guides: { chat: '# 안내서' } }).length, 1)
})

test('코드만 바꾼 PR은 막지 않는다 (11/27: 안내서는 옮길 때 맞춘다)', () => {
  // 예전에는 바뀐 파일(files)을 받아 막았다. 이제 받아도 보지 않는다
  const input = { ...base(), files: ['src/a.ts'] }
  assert.deepEqual(checkPorts(input), [])
})
