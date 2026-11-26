import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, request } from 'playwright-core'

// Browser regressions; every write from the page is intercepted. Only the conversation cases (changes draft, say box) create sandbox conversations through the API.
// pnpm test:browser (browser-check.mjs) builds, starts a fresh sandbox and runs this; CI runs it on every PR.
// Against a sandbox that is already running: node scripts/shots/input-drafts.mjs <url> <output-directory>.
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
function deferred() { let resolve = /** @type {(value?: unknown) => void} */ (() => {}); const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
async function eventually(fn, message) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(50) }
  throw new Error(message)
}
async function caseOf(name, run) {
  if (process.env.RW_TEST_CASE && process.env.RW_TEST_CASE !== name) return
  const context = await browser.newContext({ viewport: { width: 1200, height: 760 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  // 화면 언어를 미리 정해 둔다(shots.mjs와 같게): 비어 있으면 브라우저 언어(영어)로 떴다가 설정을 받은 뒤 한 번 다시 읽혀, 그 전에 누른 것이 사라진다
  await page.addInitScript(() => { try { if (!localStorage.getItem('rw-ui')) localStorage.setItem('rw-ui', JSON.stringify({ language: 'ko' })) } catch { /* ignore */ } })
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
/** 한글을 친 직후의 ⌘↵: 조합 중인 글자 → ⌘↵ → 조합 끝 (실제 입력기의 차례). 키는 isComposing으로 간다 */
async function sendKeyWhileComposing(page, syllable) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: syllable, selectionStart: syllable.length, selectionEnd: syllable.length })
  for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 4 })
  await cdp.send('Input.insertText', { text: syllable })
  await cdp.detach()
}
/** 화면이 보낸 쓰기 요청을 모은다 (서버에는 닿지 않는다) */
async function catchWrites(page) {
  const sent = []
  await page.route(`${base.origin}/api/**`, (route) => {
    const r = route.request()
    if (['GET', 'HEAD', 'OPTIONS'].includes(r.method())) return route.fallback()
    sent.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() })
    return route.fulfill({ status: 500, json: { error: 'Injected write failure' } })
  })
  return sent
}
/** 앱 업데이트 상태를 흉내 낸다 (예제 모드는 업데이트를 쓰지 않는다). swap: 화면만 바꿔 끼운 새 버전, restart: 서버가 새 버전으로 다시 켜짐 */
async function appStatus(page) {
  let running = 'aaaaaaa1', started = 'aaaaaaa1', behind = 0, head = /** @type {string | null} */ (null), restarts = 0
  const status = () => ({ running, head: head ?? running, branch: 'main', upstream: 'origin/main', behind, blocked: null, incoming: behind ? ['새 커밋'] : [], resolved: [], prepared: head !== null, started })
  await page.addInitScript(() => {
    const Native = window.WebSocket
    window.WebSocket = class extends Native {
      constructor(...args) { super(.../** @type {[string]} */ (args)); /** @type {any} */ (window).__events = this }
    }
  })
  await page.route(`${base.origin}/api/app/status*`, (route) => route.fulfill({ json: { enabled: true, status: status() } }))
  // 「업데이트하고 다시 시작」: 받은 것으로 치고 서버가 새 버전으로 다시 켜진다
  await page.route(`${base.origin}/api/app/update`, (route) => { running = started = 'ddddddd4'; behind = 0; return route.fulfill({ json: { status: status(), restarting: true, message: '업데이트했습니다' } }) })
  // 쉴 때의 다시 시작: 받아 둔 새 버전으로 서버가 다시 켜진다
  await page.route(`${base.origin}/api/app/restart`, (route) => { restarts++; running = started = head ?? running; head = null; return route.fulfill({ json: { restarting: true } }) })
  /** 서버의 앱 알림: 화면이 상태를 다시 읽는다 */
  const notify = () => page.evaluate(() => /** @type {any} */ (window).__events.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'app', research: null }) })))
  return {
    swap: async (v) => { running = v; await notify() },
    restart: async (v) => { running = started = v; await notify() },
    /** 받을 새 버전이 생김: 레일에 새 버전 버튼이 뜬다 */
    offer: async () => { behind = 1; await notify() },
    mark: () => page.evaluate(() => { /** @type {any} */ (window).__same = true }),
    /** 서버가 바뀐 새 버전을 받아 빌드해 둠: 쉴 때 다시 시작한다 */
    prepare: async (v) => { head = v; await notify() },
    restarts: () => restarts,
    notify,
    /** 이 창이 가려진 것으로: 새 화면은 가려진 창을 바로 새로 고친다. 새로 고쳐지면 표시(__same)가 사라진다 */
    hide: () => page.evaluate(() => { /** @type {any} */ (window).__same = true; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }) }),
    same: () => page.evaluate(() => /** @type {any} */ (window).__same === true).catch(() => false),
  }
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
        constructor(...args) { super(.../** @type {[string]} */ (args)); /** @type {any} */ (window).__taskEvents = this }
      }
    })
    const state = await taskPage(page, [], undefined, [original.asks[0], original.asks[0]])
    await page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true }).fill('앞 질문 초안')
    await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).fill('뒤 질문 초안')
    state.change({ asks: [original.asks[0]], hash: 'browser-removed-duplicate' })
    await page.evaluate(({ rid, id }) => /** @type {any} */ (window).__taskEvents.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'tasks', research: rid, id }) })), { rid, id: taskId })
    await eventually(() => state.reads() >= 2, 'The external question change did not reload')
    await eventually(async () => await page.getByRole('textbox', { name: '2번에 덧붙일 말', exact: true }).count() === 0, 'The duplicate was not removed')
    assert.equal(await page.getByRole('textbox', { name: '1번에 덧붙일 말', exact: true }).inputValue(), '', 'A removed duplicate draft was attached to the remaining question')
    await page.getByText('연결하지 않은 초안 2개', { exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: '1번 보관 초안', exact: true }).inputValue(), '앞 질문 초안')
    assert.equal(await page.getByRole('textbox', { name: '2번 보관 초안', exact: true }).inputValue(), '뒤 질문 초안')
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { /** @type {any} */ (window).__copiedDraft = text } } }))
    await page.getByRole('button', { name: '2번 보관 초안 복사', exact: true }).click()
    assert.equal(await page.evaluate(() => /** @type {any} */ (window).__copiedDraft), '뒤 질문 초안', 'The recovery copy did not preserve the exact draft')
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
  // 변경사항 칸의 코멘트 초안은 그 대화에만 남는다. 이 사례만 예제에 대화 둘을 만든다(화면이 아니라 여기서 API로)
  await caseOf('changes-draft-stays-in-its-chat', async (page) => {
    const edited = async (text) => {
      const id = (await (await api.post('/api/agent-chats', { data: { rid, text, scope: { kind: 'project' }, mode: 'edit' } })).json()).chat.id
      await eventually(async () => {
        const c = (await (await api.get(`/api/agent-chats/${id}`)).json()).chat
        const ask = c.items.find((x) => x.kind === 'ask' && !x.answer)
        if (ask) await api.post(`/api/agent-chats/${id}/answer`, { data: { ask: ask.id, answer: 'allow' } })
        return !ask && c.state === 'idle' && c.items.some((x) => x.kind === 'edit')
      }, 'The sandbox conversation did not finish with an edit')
      return id
    }
    const first = await edited('켐페 확인 계산을 차수 5까지 돌려 줘'), second = await edited('켐페 확인 계산을 차수 6까지 돌려 줘')
    const open = async (id) => { await page.goto(`${base.href}#/agent/${encodeURIComponent(id)}`); await page.locator('[data-ui="바뀐 곳"]').waitFor() }
    await page.goto(base.href)
    await page.evaluate(() => { localStorage.setItem('rw-agent-pane', 'true'); localStorage.setItem('rw-agent-pane-tab', '"changes"') })
    // 둘째 대화를 먼저 열어 받아 둔다: 받아 둔 대화로 옮길 때 칸이 그대로 이어져 초안이 넘어갔다
    await open(second)
    await open(first)
    await page.locator('[data-ui="바뀐 파일 펼치기"]').first().click()
    await page.locator('[data-ui="바뀐 곳 코멘트"]').first().click()
    await page.locator('.ac-diff-input').fill('첫 대화에 쓴 코멘트 초안')
    await open(second)
    await delay(200)
    assert.equal(await page.locator('.ac-diff-input, .ac-diff-note').count(), 0, 'The comment draft followed into another conversation')
    assert.equal(await page.locator('[data-ui="코멘트 보내기"]').isDisabled(), true)
    assert.equal(await page.locator('[data-ui="에이전트"] .ac-chat').count(), 1, 'The previous conversation stayed on screen')
  })
  // 한글을 친 직후 ⌘↵: 조합 중이라고 키를 버리면 보내지지 않는다. 조합이 끝난 글까지 넣어 보낸다
  await caseOf('central-talk-sends-after-korean-composition', async (page) => {
    const sent = await catchWrites(page)
    await page.goto(`${base.href}#/settings`)
    await page.locator('[data-ui="맥락 칸 켜고 끄기"]').click()
    const box = page.locator('[data-ui="중앙에게 말하기"] textarea')
    await box.click()
    await page.keyboard.type('중앙에게 ')
    await sendKeyWhileComposing(page, '말')
    await eventually(() => sent.length > 0, '⌘↵ right after Korean composition did not send to Central')
    assert.equal(sent[0].body.text, '중앙에게 말')
  })
  await caseOf('ask-say-box-sends-after-korean-composition', async (page) => {
    const id = (await (await api.post('/api/agent-chats', { data: { rid, text: '켐페 확인 계산을 차수 7까지 돌려 줘', scope: { kind: 'project' }, mode: 'edit' } })).json()).chat.id
    await eventually(async () => (await (await api.get(`/api/agent-chats/${id}`)).json()).chat.items.some((x) => x.kind === 'ask' && !x.answer), 'The sandbox conversation did not ask')
    const sent = await catchWrites(page)
    await page.goto(`${base.href}#/agent/${encodeURIComponent(id)}`)
    await page.locator('[data-ui="다르게 말하기"]').click()
    await page.locator('.ac-say-box textarea').click()
    await page.keyboard.type('다르게 ')
    await sendKeyWhileComposing(page, '해')
    await eventually(() => sent.some((w) => w.path.endsWith('/answer')), '⌘↵ right after Korean composition did not send the answer')
    assert.equal(sent.find((w) => w.path.endsWith('/answer')).body.note, '다르게 해')
  })
  await caseOf('work-composer-saves-after-korean-composition', async (page) => {
    const sent = await catchWrites(page)
    await page.goto(`${base.href}#/r/${encodeURIComponent(rid)}/log`)
    await page.locator('[data-ui="기록 거르기"]').getByRole('button', { name: '메모', exact: true }).click()
    const box = page.locator('[data-ui="기록 화면"] [data-ui="메모 입력"] textarea')
    await box.click()
    await page.keyboard.type('기록 ')
    await sendKeyWhileComposing(page, '글')
    await eventually(() => sent.length > 0, '⌘↵ right after Korean composition did not save the record')
    assert.equal(sent[0].body.text, '기록 글')
  })
  // 저절로 하는 새로 고침은 적던 글이 있으면 기다린다 (새 화면 · 다시 켜진 서버 둘 다). 글이 없어지면 새로 고친다
  await caseOf('screen-update-waits-for-typed-draft', async (page) => {
    const app = await appStatus(page)
    const first = page.waitForResponse((r) => r.url().includes('/api/app/status'))
    await page.goto(`${base.href}#/r/${encodeURIComponent(rid)}/log`)
    await first
    await page.locator('[data-ui="기록 거르기"]').getByRole('button', { name: '메모', exact: true }).click()
    const box = page.locator('[data-ui="기록 화면"] [data-ui="메모 입력"] textarea')
    await box.fill('아직 보내지 않은 글')
    await app.hide()
    await app.swap('bbbbbbb2')
    await eventually(async () => !(await app.same()) || await page.locator('[data-ui="새 버전 버튼"]').count() > 0, 'The new screen status was not read')
    await delay(300)
    assert.equal(await app.same(), true, 'The window reloaded itself over a typed draft')
    assert.equal(await box.inputValue(), '아직 보내지 않은 글')
    await box.fill('')
    await app.notify()
    await eventually(async () => !(await app.same()), 'The window did not reload once the draft was gone')
  })
  await caseOf('restart-reload-waits-for-kept-draft', async (page) => {
    const app = await appStatus(page)
    const first = page.waitForResponse((r) => r.url().includes('/api/app/status'))
    await page.goto(`${base.href}#/agent`)
    await first
    const box = page.locator('[data-ui="에이전트 입력란"] textarea')
    await box.fill('다른 화면에 가 있는 동안의 초안')
    // 입력란이 화면에서 내려가도 초안은 대화마다 남는다: 그 글도 지키는지
    await page.goto(`${base.href}#/settings`)
    await page.locator('[data-ui="앱 업데이트"]').waitFor()
    await app.hide()
    await app.restart('ccccccc3')
    await eventually(async () => !(await app.same()) || await page.locator('[data-ui="새 버전 버튼"]').count() > 0, 'The restarted status was not read')
    await delay(300)
    assert.equal(await app.same(), true, 'The window reloaded itself over a draft kept for another screen')
    await page.goto(`${base.href}#/agent`)
    assert.equal(await box.inputValue(), '다른 화면에 가 있는 동안의 초안')
  })
  await caseOf('update-click-keeps-unsent-text', async (page) => {
    const app = await appStatus(page)
    const first = page.waitForResponse((r) => r.url().includes('/api/app/status'))
    await page.goto(`${base.href}#/r/${encodeURIComponent(rid)}/log`)
    await first
    await page.locator('[data-ui="기록 거르기"]').getByRole('button', { name: '메모', exact: true }).click()
    const box = page.locator('[data-ui="기록 화면"] [data-ui="메모 입력"] textarea')
    await box.fill('업데이트를 누를 때 적혀 있던 글')
    await app.mark()
    await app.offer()
    const button = page.locator('[data-ui="새 버전 버튼"]')
    await button.click()
    // 다시 켜진 뒤 이 창은 스스로 읽지 않고, 버튼이 새로 고침으로 남는다
    await eventually(async () => !(await app.same()) || await button.getAttribute('aria-label').catch(() => null) === '새 화면 · 새로 고침', 'The update did not finish')
    assert.equal(await app.same(), true, 'The window reloaded itself over a typed draft after the update')
    assert.equal(await box.inputValue(), '업데이트를 누를 때 적혀 있던 글')
    await button.click()
    await eventually(async () => !(await app.same()), 'The reload button did not reload')
  })
  // 새 화면 읽기를 미룬 창도 쉴 때의 다시 시작은 건다 (서버가 다시 켜져도 이 창의 글은 남는다). 시계는 흉내 낸다
  await caseOf('idle-restart-is-not-held-by-a-draft', async (page) => {
    const app = await appStatus(page)
    await page.clock.install()
    const first = page.waitForResponse((r) => r.url().includes('/api/app/status'))
    await page.goto(`${base.href}#/r/${encodeURIComponent(rid)}/log`)
    await first
    await page.locator('[data-ui="기록 거르기"]').getByRole('button', { name: '메모', exact: true }).click()
    const box = page.locator('[data-ui="기록 화면"] [data-ui="메모 입력"] textarea')
    await box.fill('쉬는 동안에도 남아야 하는 글')
    await app.mark()
    const button = page.locator('[data-ui="새 버전 버튼"]')
    await app.swap('bbbbbbb2')
    await button.waitFor()
    await app.prepare('eeeeeee5')
    await eventually(async () => await button.getAttribute('aria-label') === '새 버전 · 다시 시작', 'The prepared version was not read')
    // 5분 넘게 입력이 없다: 쉬는지 보는 시계(30초마다)가 한 번 돈다
    await page.clock.fastForward(6 * 60_000)
    // 5분마다의 새 버전 확인과 겹친 차례는 건너뛰므로 다음 차례(30초 뒤)까지 본다
    for (let i = 0; i < 4 && app.restarts() === 0; i++) { await delay(200); if (app.restarts() === 0) await page.clock.runFor(31_000) }
    await eventually(() => app.restarts() === 1, 'The idle restart was held back by a draft')
    // 다시 켜졌는지 1초마다 본다
    for (let i = 0; i < 5 && await button.getAttribute('aria-label').catch(() => null) !== '새 화면 · 새로 고침'; i++) { await page.clock.runFor(1100); await delay(100) }
    assert.equal(await app.same(), true, 'The window reloaded itself over a typed draft after the idle restart')
    assert.equal(await button.getAttribute('aria-label'), '새 화면 · 새로 고침')
    assert.equal(await box.inputValue(), '쉬는 동안에도 남아야 하는 글')
  })

  // 소개 › 수정 탭: 담은 곳 · 바라는 점은 절 · 쪽 · 탭을 바꿔도 남는다 (전에는 절을 넘기면 탭이 새로 만들어져 사라졌다)
  await caseOf('about-fix-basket-survives-section-change', async (page) => {
    await catchWrites(page)
    await page.goto(new URL('#/about', base).href)
    const tabs = page.locator('[data-ui="소개 사이드바 갈래"]')
    if (!await tabs.isVisible().catch(() => false)) await page.locator('[data-ui="머리줄"] button').last().click()
    await tabs.getByRole('tab', { name: /^수정/ }).click()
    await page.locator('[data-ui="화면 구조"] .about-lead').click()
    await page.locator('[data-ui="고친 글"]').fill('고쳐 쓴 첫 문장')
    await page.locator('[data-ui="담기"]').click()
    const basket = page.locator('[data-ui="담은 곳"]')
    await eventually(async () => (await basket.locator('b').first().innerText()) === '담은 곳 1', 'The spot was not added')
    await page.locator('[data-ui="바라는 점"]').fill('표에 줄 하나 추가')
    // 다음 쪽으로: 수정 탭이 새로 만들어진다
    await page.locator('[data-ui="소개 앞뒤"] .about-step.next').click()
    await eventually(async () => !(await page.locator('[data-ui="화면 구조"]').count()), 'The next page did not open')
    assert.equal(await basket.locator('b').first().innerText(), '담은 곳 1', 'The collected spot was lost when the page changed')
    assert.equal(await page.locator('[data-ui="바라는 점"]').inputValue(), '표에 줄 하나 추가', 'The wish was lost when the page changed')
    // 다른 탭에 다녀와도
    await tabs.getByRole('tab').first().click()
    await tabs.getByRole('tab', { name: /^수정/ }).click()
    assert.equal(await basket.locator('b').first().innerText(), '담은 곳 1', 'The collected spot was lost when the tab changed')
    assert.equal(await basket.locator('li').count(), 1)
  })
} finally { await browser.close(); await api.dispose() }
await fs.writeFile(`${out}/results.json`, JSON.stringify({ base: base.href, checks }, null, 2))
assert(checks.length, 'No selected test case')
console.log(`${checks.filter((c) => c.ok).length}/${checks.length} passed`)
process.exitCode = checks.some((c) => !c.ok) ? 1 : 0
