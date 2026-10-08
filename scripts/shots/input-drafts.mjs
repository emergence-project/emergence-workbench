import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, request } from 'playwright-core'

// Read-only browser regressions; all answer writes are intercepted in this page.
// Run against a built sandbox: node scripts/shots/input-drafts.mjs <url> <output-directory>.
assert(process.argv[2], 'Usage: node scripts/shots/input-drafts.mjs <loopback-sandbox-url> [output-directory]')
const base = new URL(process.argv[2])
assert(['http:', 'https:'].includes(base.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
assert.equal(base.pathname, '/')
assert.equal(base.search + base.hash, '')
const out = path.resolve(process.argv[3] ?? 'shots/input-drafts')
await fs.mkdir(out, { recursive: true })
const api = await request.newContext({ baseURL: base.href })
const registry = await (await api.get('/api/researches')).json()
assert.equal(registry.sandbox, true, 'Requires a sandbox server')
const rid = registry.researches[0].id
const taskId = '2026-10-05-list-coloring-bound'
const tasksPath = `/api/researches/${encodeURIComponent(rid)}/tasks`
const source = await (await api.get(tasksPath)).json()
const original = source.tasks.find((t) => t.id === taskId)
assert(original && original.asks.length >= 2, 'Requires the two-question sandbox task')
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const checks = []
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
async function eventually(fn, message) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(50) }
  throw new Error(message)
}
async function caseOf(name, run) {
  if (process.env.RW_TEST_CASE && process.env.RW_TEST_CASE !== name) return
  const context = await browser.newContext({ viewport: { width: 1200, height: 760 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(`${base.origin}/api/**`, (route) => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
    ? route.fallback() : route.fulfill({ status: 405, json: { error: 'Unexpected mutation blocked by read-only browser test' } }))
  try { await run(page); assert.deepEqual(errors, [], 'Application threw during the browser regression'); checks.push({ name, ok: true }); console.log(`PASS ${name}`) }
  catch (e) { await page.screenshot({ path: `${out}/${name}.png` }).catch(() => {}); checks.push({ name, ok: false, error: e.message }); console.error(`FAIL ${name}: ${e.message}`) }
  finally { await context.close() }
}
async function taskPage(page, answers = [], responseGate, asks = original.asks) {
  let task = { ...original, asks, answers, hash: 'browser-original' }
  let writes = 0
  let reads = 0
  const started = deferred()
  await page.route(`${base.origin}${tasksPath}`, async (route) => {
    assert.equal(route.request().method(), 'GET')
    reads++
    await route.fulfill({ json: { ...source, tasks: source.tasks.map((t) => t.id === taskId ? task : t) } })
  })
  await page.route(`${base.origin}${tasksPath}/${taskId}/answer`, async (route) => {
    assert.equal(route.request().method(), 'POST')
    const input = route.request().postDataJSON()
    writes++
    started.resolve()
    if (responseGate) await responseGate.promise
    if (input.baseHash !== task.hash) return route.fulfill({ status: 409, json: { error: 'Injected concurrent answer conflict', currentHash: task.hash } })
    task = { ...task, hash: `browser-answer-${writes}`, answers: [...task.answers.filter((a) => a.n !== input.n), { ...input, at: '2026-10-07 12:00' }] }
    await route.fulfill({ json: { task } })
  })
  await page.goto(`${base.href}#/r/${encodeURIComponent(rid)}/k/${taskId}`)
  await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).waitFor()
  return { started, reads: () => reads, writes: () => writes, task: () => task, change: (patch) => { task = { ...task, ...patch } } }
}
async function searchPage(page, handler) {
  await page.route(`${base.origin}/api/search/catalog`, (route) => route.fulfill({ json: { items: [], library: true } }))
  await page.route(`${base.origin}/api/concepts/list?*`, handler)
  await page.goto(base.href)
  await page.locator('[data-ui="검색 버튼"]').click()
  const input = page.getByRole('combobox', { name: '찾을 말', exact: true })
  await input.waitFor()
  return input
}
try {
  await caseOf('task-other-answer-keeps-unsaved-note', async (page) => {
    const state = await taskPage(page)
    const note = page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true })
    await note.fill('둘째 질문의 아직 고르는 중인 초안')
    await page.getByRole('group', { name: '1번 답', exact: true }).getByRole('button', { name: '예', exact: true }).click()
    await eventually(() => state.reads() >= 2, 'Answer did not reload the task')
    await delay(100)
    assert.equal(await note.inputValue(), '둘째 질문의 아직 고르는 중인 초안')
    await page.screenshot({ path: `${out}/task-other-answer-keeps-unsaved-note-retained.png` })
  })
  await caseOf('task-late-answer-keeps-newer-note', async (page) => {
    const gate = deferred()
    try {
      const state = await taskPage(page, [{ n: 1, answer: '예', note: '처음 말', at: '2026-10-07 11:00' }], gate)
      const note = page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true })
      await note.fill('저장에 보낸 말')
      await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).focus()
      await state.started.promise
      await note.fill('답을 기다리는 동안 더 고친 말')
      gate.resolve()
      await eventually(() => state.reads() >= 2, 'Late answer did not reload')
      await delay(100)
      assert.equal(await note.inputValue(), '답을 기다리는 동안 더 고친 말')
      assert.equal(state.task().answers.find((a) => a.n === 1).note, '저장에 보낸 말')
    } finally { gate.resolve() }
  })
  await caseOf('task-late-answer-keeps-reverted-note', async (page) => {
    const gate = deferred()
    try {
      const state = await taskPage(page, [{ n: 1, answer: '예', note: '처음 말', at: '2026-10-07 11:00' }], gate)
      const note = page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true })
      await note.fill('저장에 보낸 말')
      await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).focus()
      await state.started.promise
      await note.fill('처음 말')
      gate.resolve()
      await eventually(() => state.reads() >= 2, 'Late answer did not reload after reverting')
      await delay(100)
      assert.equal(await note.inputValue(), '처음 말', 'The late answer replaced the note reverted while saving')
      assert.equal(state.task().answers.find((a) => a.n === 1).note, '저장에 보낸 말')
      await page.screenshot({ path: `${out}/task-late-answer-keeps-reverted-note-retained.png` })
    } finally { gate.resolve() }
  })
  await caseOf('task-overlapping-answer-conflict-keeps-reverted-note', async (page) => {
    const gate = deferred()
    try {
      const state = await taskPage(page, [{ n: 1, answer: '예', note: '처음 말', at: '2026-10-07 11:00' }], gate)
      const note = page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true })
      await note.fill('저장에 보낸 말')
      await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).focus()
      await state.started.promise
      await note.fill('처음 말')
      await page.getByRole('group', { name: '1번 답', exact: true }).getByRole('button', { name: '예', exact: true }).click()
      await eventually(() => state.writes() >= 2, 'The overlapping answer did not start')
      gate.resolve()
      await eventually(() => state.reads() >= 3, 'Both answer completions did not reload')
      await delay(100)
      assert.equal(await note.inputValue(), '처음 말', 'The conflict reload replaced the reverted note')
      assert.equal(state.task().answers.find((a) => a.n === 1).note, '저장에 보낸 말')
      await page.screenshot({ path: `${out}/task-overlapping-answer-conflict-keeps-reverted-note-retained.png` })
    } finally { gate.resolve() }
  })
  await caseOf('task-duplicate-removal-keeps-unassigned-drafts', async (page) => {
    await page.addInitScript(() => {
      const Native = window.WebSocket
      window.WebSocket = class extends Native {
        constructor(...args) { super(...args); window.__taskEvents = this }
      }
    })
    const state = await taskPage(page, [], undefined, [original.asks[0], original.asks[0]])
    await page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true }).fill('앞 질문 초안')
    await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).fill('뒤 질문 초안')
    state.change({ asks: [original.asks[0]], hash: 'browser-removed-duplicate' })
    await page.evaluate((rid) => window.__taskEvents.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'task', research: rid }) })), rid)
    await eventually(() => state.reads() >= 2, 'The external question change did not reload')
    await eventually(async () => await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).count() === 0, 'The duplicate was not removed')
    assert.equal(await page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true }).inputValue(), '', 'A removed duplicate draft was attached to the remaining question')
    await page.getByText('연결하지 않은 초안 2개', { exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: '1번 보관 초안', exact: true }).inputValue(), '앞 질문 초안')
    assert.equal(await page.getByRole('textbox', { name: '2번 보관 초안', exact: true }).inputValue(), '뒤 질문 초안')
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copiedDraft = text } } }))
    await page.getByRole('button', { name: '2번 보관 초안 복사', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__copiedDraft), '뒤 질문 초안', 'The recovery copy did not preserve the exact draft')
    assert.equal(state.writes(), 0, 'External refresh wrote a draft to the task file')
    await page.screenshot({ path: `${out}/task-duplicate-removal-keeps-unassigned-drafts-retained.png` })
  })
  await caseOf('search-new-query-cannot-open-old-hit', async (page) => {
    const gate = deferred()
    try {
      const input = await searchPage(page, async (route) => {
        const q = new URL(route.request().url()).searchParams.get('q')
        if (q === 'zz-no-hit') { await gate.promise; return route.fulfill({ json: { items: [] } }) }
        return route.fulfill({ json: { items: [{ id: 'planar-graph', title: 'Planar Graph', subject: 'Mathematics' }] } })
      })
      await input.fill('Planar')
      await page.getByRole('option', { name: /Planar Graph/ }).waitFor()
      await input.fill('zz-no-hit')
      await page.screenshot({ path: `${out}/search-new-query-cannot-open-old-hit-pending.png` })
      assert.equal(await page.getByRole('option', { name: /Planar Graph/ }).count(), 0, 'Previous query hit remains selectable')
      assert((await page.locator('.sr-list').innerText()).includes('찾는 중'), 'Pending concept search is reported as no hits')
      await input.press('Enter')
      assert.equal(new URL(page.url()).hash, '', 'Enter opened an obsolete concept hit')
      gate.resolve()
      await page.getByText('"zz-no-hit"와 맞는 것이 없습니다', { exact: true }).waitFor()
    } finally { gate.resolve() }
  })
  await caseOf('search-late-old-response-cannot-replace-current-hits', async (page) => {
    const gate = deferred()
    const started = deferred()
    const returned = deferred()
    try {
      const input = await searchPage(page, async (route) => {
        const q = new URL(route.request().url()).searchParams.get('q')
        if (q === 'old-query') {
          started.resolve()
          await gate.promise
          await route.fulfill({ json: { items: [{ id: 'old-note', title: 'Old query note', subject: 'Mathematics' }] } })
          returned.resolve()
          return
        }
        return route.fulfill({ json: { items: [{ id: 'new-note', title: 'New query note', subject: 'Mathematics' }] } })
      })
      await input.fill('old-query')
      await started.promise
      await input.fill('new-query')
      await page.getByRole('option', { name: /New query note/ }).waitFor()
      gate.resolve()
      await returned.promise
      await delay(100)
      assert.equal(await page.getByRole('option', { name: /Old query note/ }).count(), 0)
      assert.equal(await page.getByRole('option', { name: /New query note/ }).count(), 1)
    } finally { gate.resolve() }
  })
  await caseOf('search-failure-is-not-no-hits', async (page) => {
    const input = await searchPage(page, (route) => route.fulfill({ status: 500, json: { error: 'Injected read failure' } }))
    await input.fill('failed-query')
    await eventually(async () => (await page.locator('.sr-list').innerText()).includes('개념노트를 찾지 못했습니다'), 'Search failure was presented as no hits')
    assert.equal(await page.getByText('"failed-query"와 맞는 것이 없습니다', { exact: true }).count(), 0)
  })
} finally { await browser.close(); await api.dispose() }
await fs.writeFile(`${out}/results.json`, JSON.stringify({ base: base.href, checks }, null, 2))
assert(checks.length, 'No selected test case')
console.log(`${checks.filter((c) => c.ok).length}/${checks.length} passed`)
process.exitCode = checks.some((c) => !c.ok) ? 1 : 0
