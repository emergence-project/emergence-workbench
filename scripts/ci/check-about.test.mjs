import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAbout, isScreenFile } from './check-about.mjs'

test('화면 파일을 가른다', () => {
  assert.ok(isScreenFile('apps/web/src/FlowView.tsx'))
  assert.ok(isScreenFile('apps/web/src/styles/flow.css'))
  assert.ok(!isScreenFile('apps/web/src/aboutContent.tsx'))
  assert.ok(!isScreenFile('apps/web/src/router.test.tsx'))
  assert.ok(!isScreenFile('apps/server/src/app.ts'))
})

test('화면을 바꾸면 소개도 고치거나 그대로인 이유를 적는다', () => {
  const files = ['apps/web/src/FlowView.tsx']
  assert.equal(checkAbout({ files, messages: '흐름 고침', aboutSource: '', pr: 5 }).length, 1)
  assert.deepEqual(checkAbout({ files, messages: '흐름 고침\n\n소개: 그대로 — 여백만', aboutSource: '', pr: 5 }), [])
  assert.deepEqual(checkAbout({ files: ['apps/server/src/app.ts'], messages: '', aboutSource: '', pr: 5 }), [])
})

test('소개를 고치면 고친 절의 prs에 PR 번호가 있다', () => {
  const files = ['apps/web/src/FlowView.tsx', 'apps/web/src/aboutContent.tsx']
  assert.equal(checkAbout({ files, messages: '', aboutSource: "title: '흐름', prs: [90, 91]", pr: 102 }).length, 1)
  assert.deepEqual(checkAbout({ files, messages: '', aboutSource: "title: '흐름', prs: [90, 102]", pr: 102 }), [])
  assert.deepEqual(checkAbout({ files, messages: '', aboutSource: '', pr: undefined }), [])
})
