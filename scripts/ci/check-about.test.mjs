import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aboutReminders, checkAbout, fragmentPr, isAboutText, isScreenFile, sectionOf, sectionsFor } from './check-about.mjs'

test('화면 파일을 가른다', () => {
  assert.ok(isScreenFile('apps/web/src/FlowView.tsx'))
  assert.ok(isScreenFile('apps/web/src/styles/flow.css'))
  assert.ok(!isScreenFile('apps/web/src/aboutContent.tsx'))
  assert.ok(!isScreenFile('apps/web/src/about/project.tsx'))
  assert.ok(!isScreenFile('apps/web/src/about/project/flow.tsx'))
  assert.ok(!isScreenFile('apps/web/src/router.test.tsx'))
  assert.ok(!isScreenFile('apps/server/src/app.ts'))
  assert.ok(!isAboutText('apps/web/src/about/prs/12.json'))
  assert.equal(fragmentPr('apps/web/src/about/prs/12.json'), 12)
  assert.equal(fragmentPr('apps/web/src/about/project/flow.tsx'), undefined)
})

test('화면만 바꾼 PR은 막지 않고, 함께 고쳐 온 소개 절을 짚어 알린다 (11/27)', () => {
  const files = ['apps/web/src/FlowView.tsx']
  assert.deepEqual(checkAbout({ files, messages: '흐름 고침', aboutSource: '', pr: 5 }), [])
  const history = [
    { files: ['apps/web/src/FlowView.tsx', 'apps/web/src/about/project/flow.tsx'] },
    { files: ['apps/web/src/FlowView.tsx', 'apps/web/src/about/project/flow.tsx', 'apps/web/src/about/project.tsx'] },
    { files: ['apps/web/src/FlowView.tsx', 'apps/web/src/about/agents/app.tsx'] },
    { files: ['apps/web/src/Other.tsx', 'apps/web/src/about/agents/other.tsx'] },
  ]
  assert.deepEqual(sectionsFor(files, history), ['project/flow', 'agents/app'])
  assert.equal(sectionOf('apps/web/src/about/project.tsx'), undefined)
  const [r] = aboutReminders({ files, messages: '흐름 고침', history })
  assert.match(r ?? '', /about\/project\/flow\.tsx, apps\/web\/src\/about\/agents\/app\.tsx/)
  assert.match(aboutReminders({ files, messages: '', history: [] })[0] ?? '', /함께 고쳐 온 소개 절이 없습니다/)
  // 소개를 고쳤거나, 그대로인 이유를 적었거나, 화면이 아니면 알리지 않는다
  assert.deepEqual(aboutReminders({ files: [...files, 'apps/web/src/about/project/flow.tsx'], messages: '', history }), [])
  assert.deepEqual(aboutReminders({ files, messages: '흐름 고침\n\n소개: 그대로 — 여백만', history }), [])
  assert.deepEqual(aboutReminders({ files: ['apps/server/src/app.ts'], messages: '', history }), [])
})

test('소개를 고치면 고친 절의 prs에 PR 번호가 있다', () => {
  const files = ['apps/web/src/FlowView.tsx', 'apps/web/src/aboutContent.tsx']
  assert.equal(checkAbout({ files, messages: '', aboutSource: "title: '흐름', prs: [90, 91]", pr: 102 }).length, 1)
  assert.deepEqual(checkAbout({ files, messages: '', aboutSource: "title: '흐름', prs: [90, 102]", pr: 102 }), [])
  assert.deepEqual(checkAbout({ files, messages: '', aboutSource: '', pr: undefined }), [])
  // 절 파일 (about/<쪽>/<절>.tsx)
  const sec = ['apps/web/src/FlowView.tsx', 'apps/web/src/about/project/flow.tsx']
  assert.deepEqual(checkAbout({ files: sec, messages: '', aboutSource: '', pr: 102 }).length, 1)
  assert.deepEqual(checkAbout({ files: sec, messages: '', aboutSource: "title: '흐름', id: 'flow', prs: [90, 102],", pr: 102 }), [])
  // 번호 조각 about/prs/<번호>.json (11/20): 이 PR 번호의 조각이 있으면 통과, 조각만으로는 소개를 고친 것이 아니다
  assert.deepEqual(checkAbout({ files: [...sec, 'apps/web/src/about/prs/102.json'], messages: '', aboutSource: '', pr: 102 }), [])
  assert.equal(checkAbout({ files: [...sec, 'apps/web/src/about/prs/101.json'], messages: '', aboutSource: '', pr: 102 }).length, 1)
  // 조각만 있고 소개 글을 고치지 않은 PR은 막지 않는다(화면 변경은 알림만, 11/27)
  assert.deepEqual(checkAbout({ files: ['apps/web/src/FlowView.tsx', 'apps/web/src/about/prs/102.json'], messages: '', aboutSource: '', pr: 102 }), [])
  // 글을 옮기기만 한 정리는 "소개: 그대로"로 번호 없이 통과
  assert.deepEqual(checkAbout({ files: sec, messages: '정리\n\n소개: 그대로 — 옮김', aboutSource: '', pr: 102 }), [])
})
