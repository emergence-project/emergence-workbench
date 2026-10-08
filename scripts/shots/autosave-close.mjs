import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, request } from 'playwright-core'

// PR1 tab-close regression: 3 autosave cases, 3 manual-save concept cases,
// and 2 workspace/native-history cases while a tab-close save is waiting.
// The original 6 reproduced draft-losing tab removal on the pre-PR1 main build.
// Run against an already built and running RW_SANDBOX=1 static example server:
// node scripts/shots/autosave-close.mjs http://127.0.0.1:PORT [output-directory]
// Set RW_TEST_CASE to run a single named case while reproducing a regression.
// This script never builds or starts the app. Every case restores both fixtures.
// Default artifacts live under the ignored shots/autosave-close directory.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
assert(process.argv[2], 'Usage: node scripts/shots/autosave-close.mjs <loopback-sandbox-url> [output-directory]')
const base = new URL(process.argv[2])
assert(['http:', 'https:'].includes(base.protocol), 'The test requires an HTTP sandbox URL')
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'The test requires a loopback sandbox URL')
assert.equal(base.pathname, '/', 'The sandbox URL must point to the app root')
assert.equal(base.search, '', 'The sandbox URL must not contain a query')
assert.equal(base.hash, '', 'The sandbox URL must not contain a fragment')
const out = path.resolve(process.argv[3] ?? path.join(root, 'shots/autosave-close'))
const label = path.basename(out).replace(/[^a-zA-Z0-9_-]/g, '_')
await fs.mkdir(out, { recursive: true })

const api = await request.newContext({ baseURL: base.href, extraHTTPHeaders: { Origin: base.origin } })
const registryResponse = await api.get('/api/researches')
assert(registryResponse.ok(), `Research registry returned ${registryResponse.status()}`)
const registry = await registryResponse.json()
assert.equal(registry.sandbox, true, 'Refusing to change a non-sandbox server')
const research = registry.researches.find((r) => r.path?.endsWith('/.sandbox/sample-research'))
assert(research, 'The sample-research sandbox fixture is missing')
const rid = research.id
const file = 'workbench/notes/kempe-recoloring/note.md'
const endpoint = `/api/researches/${encodeURIComponent(rid)}/manuscript/part`
const readEndpoint = `${endpoint}?file=${encodeURIComponent(file)}`
const routeURL = `${base.origin}${endpoint}`
const noteURL = `${base.href}#/r/${encodeURIComponent(rid)}/w/${encodeURIComponent(file)}`
const conceptId = process.env.RW_TEST_CONCEPT ?? 'planar-graph'
const conceptEndpoint = `/api/concepts/${encodeURIComponent(conceptId)}`
const conceptRouteURL = `${base.origin}${conceptEndpoint}`
const conceptURL = `${base.href}#/r/${encodeURIComponent(rid)}/c/${encodeURIComponent(conceptId)}`
const token = `RW_PR1_${label}_${Date.now()}`

async function read() {
  const res = await api.get(readEndpoint)
  assert(res.ok(), `Read returned ${res.status()}`)
  return res.json()
}
async function write(content, baseHash) {
  const res = await api.put(endpoint, { data: { file, content, baseHash } })
  assert(res.ok(), `Sandbox write returned ${res.status()}: ${await res.text()}`)
  return res.json()
}
const original = await read()
async function readConcept() {
  const res = await api.get(conceptEndpoint)
  assert(res.ok(), `Concept read returned ${res.status()}`)
  return res.json()
}
async function writeConcept(body, baseHash) {
  const res = await api.put(conceptEndpoint, { data: { body, baseHash } })
  assert(res.ok(), `Sandbox concept write returned ${res.status()}: ${await res.text()}`)
  return res.json()
}
const originalConcept = await readConcept()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const checks = []

function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
async function eventually(fn, message, timeout = 10000) {
  const until = Date.now() + timeout
  let last
  while (Date.now() < until) {
    try { const value = await fn(); if (value) return value } catch (e) { last = e }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`)
}
async function settleUI(page) {
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-ui="저장 상태"]')].some((e) => e.classList.contains('saving')), undefined, { timeout: 10000 })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}
async function openNote(context) {
  await context.addInitScript(() => localStorage.setItem('rw.notes.editView', JSON.stringify('source')))
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  await page.goto(noteURL)
  const pane = page.locator('[data-ui="원고 장"]').filter({ visible: true }).first()
  await pane.locator('[data-ui="고치기"]').click()
  const editor = pane.locator('.cm-content[contenteditable="true"]')
  await editor.waitFor({ state: 'visible' })
  const tab = page.locator('[role="tab"][aria-selected="true"]').filter({ has: page.locator('button[aria-label^="탭 닫기:"]') }).first()
  const closeName = await tab.locator('button[aria-label^="탭 닫기:"]').getAttribute('aria-label')
  assert(closeName, 'The editable note tab has no close button')
  const close = page.getByRole('button', { name: closeName, exact: true })
  return { page, pane, editor, close }
}
async function openConcept(context) {
  await context.addInitScript(() => localStorage.setItem('rw.concepts.editMode', 'split'))
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  await page.goto(conceptURL)
  const pane = page.locator('[data-ui="개념노트"]').filter({ visible: true }).first()
  await pane.locator('[data-ui="고치기"]').click()
  const editor = pane.locator('.cm-content[contenteditable="true"]')
  await editor.waitFor({ state: 'visible' })
  const tab = page.locator('[role="tab"][aria-selected="true"]').filter({ has: page.locator('button[aria-label^="탭 닫기:"]') }).first()
  const closeName = await tab.locator('button[aria-label^="탭 닫기:"]').getAttribute('aria-label')
  assert(closeName, 'The concept tab has no close button')
  const close = page.getByRole('button', { name: closeName, exact: true })
  const save = pane.getByRole('button', { name: '편집 완료', exact: true })
  return { page, pane, editor, close, save }
}
function bodyOf(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '')
}
async function replaceBody(ui, full) {
  await ui.editor.click()
  await ui.editor.press('ControlOrMeta+A')
  await ui.page.keyboard.insertText(bodyOf(full))
}
async function retained(ui, marker) {
  assert.equal(await ui.close.count(), 1, 'Failed save removed the editable tab')
  assert(await ui.editor.isVisible(), 'Failed save unmounted the editor')
  assert((await ui.editor.innerText()).includes(marker), 'The retained editor lost the unsaved draft')
  await ui.editor.locator('.cm-line').filter({ hasText: marker }).last().evaluate((line) => line.scrollIntoView({ block: 'center' }))
}
async function beforeUnloadBlocked(page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
}
async function caseOf(name, run, opener = openNote) {
  if (process.env.RW_TEST_CASE && process.env.RW_TEST_CASE !== name) return
  const context = await browser.newContext({ viewport: { width: 1200, height: 760 }, reducedMotion: 'reduce' })
  let page
  try {
    const ui = await opener(context)
    page = ui.page
    await run(ui)
    checks.push({ name, ok: true })
    console.log(`PASS ${name}`)
  } catch (e) {
    const screenshot = `${out}/${name}.png`
    if (page) await page.screenshot({ path: screenshot }).catch(() => {})
    checks.push({ name, ok: false, error: e.message, screenshot: page ? screenshot : null })
    console.error(`FAIL ${name}: ${e.message}`)
  } finally {
    await context.close()
    // Closing the entire context stops page JavaScript before restoring the fixture.
    const current = await read()
    if (current.content !== original.content) await write(original.content, current.hash)
    const concept = await readConcept()
    if (concept.body !== originalConcept.body) await writeConcept(originalConcept.body, concept.hash)
  }
}

try {
  await caseOf('500-close-draft-retry', async (ui) => {
    const marker = `${token}_500_DRAFT`
    const draft = `${original.content}\n${marker}\n`
    let failing = true
    const observed = []
    await ui.page.route(routeURL, async (route) => {
      const req = route.request()
      if (req.method() !== 'PUT') return route.continue()
      const body = req.postDataJSON()
      if (body.file !== file) return route.continue()
      observed.push(body)
      if (failing) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'PR1 injected save failure' }) })
      return route.continue()
    })
    await replaceBody(ui, draft)
    await ui.pane.locator('[data-ui="저장 상태"].error').waitFor({ state: 'visible' })
    assert.equal((await read()).content, original.content, 'A rejected write changed the server file')
    await ui.close.click()
    await settleUI(ui.page)
    await retained(ui, marker)
    await ui.page.screenshot({ path: `${out}/500-close-draft-retry-retained.png` })
    assert(await beforeUnloadBlocked(ui.page), 'The failed unsaved draft lost its window-close protection')
    assert.equal((await read()).content, original.content, 'Closing after 500 changed the server file')
    failing = false
    await ui.pane.getByRole('button', { name: '다시 저장', exact: true }).click()
    await ui.pane.locator('[data-ui="저장 상태"].saved').waitFor({ state: 'visible' })
    assert.equal((await read()).content, draft, 'Retry failed to write the exact retained draft')
    assert(observed.every((r) => r.content === draft), 'A save attempt substituted or truncated the draft')
    assert.equal(await beforeUnloadBlocked(ui.page), false, 'Saved text still blocks window closing')
    await ui.close.click()
    await eventually(async () => (await ui.close.count()) === 0, 'A successfully saved tab could not close')
  })

  await caseOf('409-close-external-preserved', async (ui) => {
    const marker = `${token}_409_DRAFT`
    const externalMarker = `${token}_EXTERNAL`
    const draft = `${original.content}\n${marker}\n`
    const external = `${original.content}\n${externalMarker}\n`
    const responses = []
    let changedOutside = false
    const attempts = []
    await ui.page.route(routeURL, async (route) => {
      const req = route.request()
      if (req.method() !== 'PUT') return route.continue()
      const body = req.postDataJSON()
      if (body.file !== file) return route.continue()
      attempts.push(body)
      if (!changedOutside) {
        changedOutside = true
        const current = await read()
        await write(external, current.hash)
      }
      // This is an actual stale-baseHash server response, not a mocked 409.
      const response = await route.fetch()
      responses.push(response.status())
      await route.fulfill({ response })
    })
    await replaceBody(ui, draft)
    await ui.pane.locator('[data-ui="저장 상태"].conflict').waitFor({ state: 'visible' })
    assert.deepEqual(responses, [409], 'The external edit did not produce an actual server 409')
    assert.equal((await read()).content, external, 'The conflicting draft overwrote the external file')
    await ui.close.click()
    await settleUI(ui.page)
    await retained(ui, marker)
    await ui.page.screenshot({ path: `${out}/409-close-external-preserved-retained.png` })
    assert(await beforeUnloadBlocked(ui.page), 'The conflicting unsaved draft lost its window-close protection')
    assert.equal(attempts.length, 1, 'A conflicted saver retried its stale write while closing')
    assert.equal((await read()).content, external, 'Closing a conflicted tab overwrote the external file')
    // The explicit discard control is the only way this test abandons its draft.
    await ui.pane.getByRole('button', { name: '파일 다시 읽기', exact: true }).first().click()
    await ui.pane.locator('[data-ui="저장 상태"].saved').waitFor({ state: 'visible' })
    assert.equal((await read()).content, external, 'Reload rewrote the external file')
    await ui.close.click()
    await eventually(async () => (await ui.close.count()) === 0, 'A reloaded conflict-free tab could not close')
  })

  await caseOf('inflight-new-edit-close', async (ui) => {
    const firstMarker = `${token}_FIRST`
    const latestMarker = `${token}_LATEST`
    const first = `${original.content}\n${firstMarker}\n`
    const latest = `${first}${latestMarker}\n`
    const gate = deferred()
    const started = deferred()
    const attempts = []
    let firstHash
    let firstInFlight = false
    let overlapping = false
    await ui.page.route(routeURL, async (route) => {
      const req = route.request()
      if (req.method() !== 'PUT') return route.continue()
      const body = req.postDataJSON()
      if (body.file !== file) return route.continue()
      attempts.push(body)
      if (attempts.length === 1) {
        firstInFlight = true
        started.resolve()
        await gate.promise
        const response = await route.fetch()
        assert.equal(response.status(), 200, 'The first delayed save failed')
        firstHash = (await response.json()).hash
        firstInFlight = false
        return route.fulfill({ response })
      }
      if (firstInFlight) overlapping = true
      return route.continue()
    })
    try {
      await replaceBody(ui, first)
      await Promise.race([started.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('The first save did not start')), 10000))])
      await replaceBody(ui, latest)
      await ui.close.click()
      assert.equal(await ui.close.count(), 1, 'The tab closed before the delayed save completed')
      assert.equal(attempts.length, 1, 'A second save started before the first returned its hash')
      await retained(ui, latestMarker)
      gate.resolve()
      await eventually(async () => (await read()).content === latest, 'Closing failed to preserve the edit made during saving')
      assert.equal(overlapping, false, 'Two writes overlapped')
      assert.equal(attempts.length, 2, 'The newest draft was not saved exactly once after the first write')
      assert.equal(attempts[1].content, latest, 'The second write lost the newest edit')
      assert.equal(attempts[1].baseHash, firstHash, 'The second write did not use the first save hash')
      // A policy that retains the tab after a concurrent edit is also safe.
      // If it does so, a fresh close after all text is saved must succeed.
      if (await ui.close.count()) { await settleUI(ui.page); await ui.close.click() }
      await eventually(async () => (await ui.close.count()) === 0, 'The fully saved tab could not close')
      assert.equal((await read()).content, latest, 'Final close changed the saved draft')
    } finally {
      gate.resolve()
    }
  })

  await caseOf('closing-blocks-other-workspace-actions', async (ui) => {
    const otherFile = 'docs/note/chapters/02-five-color.tex'
    const otherURL = `${base.href}#/r/${encodeURIComponent(rid)}/w/${encodeURIComponent(otherFile)}`
    await ui.page.goto(otherURL)
    await ui.page.locator('[data-ui="LaTeX 편집기"]').filter({ visible: true }).first().waitFor({ state: 'visible' })
    const otherTab = ui.page.locator('[role="tab"][aria-selected="true"]').filter({ has: ui.page.locator('button[aria-label^="탭 닫기:"]') }).first()
    const otherCloseName = await otherTab.locator('button[aria-label^="탭 닫기:"]').getAttribute('aria-label')
    assert(otherCloseName, 'The second note tab has no close button')
    const otherClose = ui.page.getByRole('button', { name: otherCloseName, exact: true })
    const other = otherClose.locator('..')
    await ui.page.goto(noteURL)
    await ui.editor.waitFor({ state: 'visible' })
    const split = ui.page.locator('[data-ui="두 칸 켜고 끄기"]')
    if ((await split.getAttribute('aria-pressed')) !== 'true') await split.click()
    await eventually(async () => (await split.getAttribute('aria-pressed')) === 'true', 'The two-pane test setup failed')
    const expectedHash = new URL(noteURL).hash
    const expectedTitle = await ui.close.getAttribute('aria-label')
    const marker = `${token}_POLICY_DRAFT`
    const draft = `${original.content}\n${marker}\n`
    const gate = deferred()
    const started = deferred()
    const violations = []
    const snapshots = []
    await ui.page.route(routeURL, async (route) => {
      const req = route.request()
      if (req.method() !== 'PUT' || req.postDataJSON().file !== file) return route.continue()
      started.resolve()
      await gate.promise
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'PR1 delayed close-save failure' }) })
    })
    async function snapshot(action) {
      await ui.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const selected = ui.page.locator('.ws-pane.focused [role="tab"][aria-selected="true"] button[aria-label^="탭 닫기:"]')
      const state = {
        action,
        hash: new URL(ui.page.url()).hash,
        a: await ui.close.count(),
        b: await otherClose.count(),
        focused: (await selected.count()) === 1 ? await selected.getAttribute('aria-label') : null,
        split: await split.getAttribute('aria-pressed'),
      }
      snapshots.push(state)
      if (state.hash !== expectedHash) violations.push(`${action}: navigation changed the URL while closing`)
      if (state.a !== 1 || state.b !== 1) violations.push(`${action}: A/B tabs were removed while closing`)
      if (state.focused !== expectedTitle) violations.push(`${action}: selected tab and A's URL disagree`)
      if (state.split !== 'true') violations.push(`${action}: the panes merged while closing`)
    }
    try {
      await replaceBody(ui, draft)
      await ui.close.click()
      await Promise.race([started.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('The close-save request did not start')), 10000))])
      await other.click()
      await snapshot('select-other-tab')
      if (await otherClose.count()) await otherClose.click()
      await snapshot('close-other-tab')
      // This click also exercises focusPane rather than only tab activation.
      await ui.page.locator('[data-ui="오른쪽 칸"]').click({ position: { x: 20, y: 90 } })
      await snapshot('focus-other-pane')
      await split.click()
      await snapshot('merge-panes')
      await ui.page.locator('[data-ui="왼쪽 띠"] [data-ui="홈"]').click()
      await snapshot('go-home')
      gate.resolve()
      await ui.pane.locator('[data-ui="저장 상태"].error').waitFor({ state: 'visible' })
      await snapshot('failed-close-save-settled')
      await fs.writeFile(`${out}/closing-blocks-other-workspace-actions-state.json`, JSON.stringify(snapshots, null, 2))
      await retained(ui, marker)
      assert.equal((await read()).content, original.content, 'The delayed 500 changed the server file')
      assert.deepEqual(violations, [], 'Workspace actions changed state before the tab-close save finished')
      await ui.page.screenshot({ path: `${out}/closing-blocks-other-workspace-actions-retained.png` })
    } finally {
      gate.resolve()
    }
  })

  await caseOf('native-back-keeps-history', async (ui) => {
    const previousFile = 'docs/note/chapters/02-five-color.tex'
    const previousURL = `${base.href}#/r/${encodeURIComponent(rid)}/w/${encodeURIComponent(previousFile)}`
    await ui.page.goto(previousURL)
    await ui.page.locator('[data-ui="LaTeX 편집기"]').filter({ visible: true }).first().waitFor({ state: 'visible' })
    const previousHash = new URL(previousURL).hash
    const previousTab = ui.page.locator('[role="tab"][aria-selected="true"]').filter({ has: ui.page.locator('button[aria-label^="탭 닫기:"]') }).first()
    const previousTitle = await previousTab.locator('button[aria-label^="탭 닫기:"]').getAttribute('aria-label')
    await ui.page.goto(noteURL)
    await ui.editor.waitFor({ state: 'visible' })
    const expectedHash = new URL(noteURL).hash
    const marker = `${token}_NATIVE_BACK_DRAFT`
    const gate = deferred()
    const started = deferred()
    const states = []
    await ui.page.route(routeURL, async (route) => {
      const req = route.request()
      if (req.method() !== 'PUT' || req.postDataJSON().file !== file) return route.continue()
      started.resolve()
      await gate.promise
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'PR1 native-back close-save failure' }) })
    })
    async function state(action) {
      await ui.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const visiblePanes = ui.page.locator('.ws-pane').filter({ visible: true })
      const pane = (await visiblePanes.count()) === 1 ? visiblePanes : ui.page.locator('.ws-pane.focused')
      const selected = pane.locator('[role="tab"][aria-selected="true"] button[aria-label^="탭 닫기:"]')
      const value = {
        action,
        hash: new URL(ui.page.url()).hash,
        focused: (await selected.count()) === 1 ? await selected.getAttribute('aria-label') : null,
        historyLength: await ui.page.evaluate(() => history.length),
      }
      states.push(value)
      return value
    }
    try {
      await replaceBody(ui, `${original.content}\n${marker}\n`)
      await ui.close.click()
      await Promise.race([started.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('The history-case close-save request did not start')), 10000))])
      await state('close-save-waiting')
      await ui.page.goBack({ waitUntil: 'commit' })
      await eventually(() => new URL(ui.page.url()).hash === expectedHash, 'Native back did not return to the protected current entry')
      await retained(ui, marker)
      await state('native-back-blocked')
      await ui.page.screenshot({ path: `${out}/native-back-keeps-history-retained.png` })
      gate.resolve()
      await ui.pane.locator('[data-ui="저장 상태"].error').waitFor({ state: 'visible' })
      await state('close-save-failed')
      await ui.page.goBack({ waitUntil: 'commit' })
      const after = await state('native-back-after-failure')
      await fs.writeFile(`${out}/native-back-keeps-history-state.json`, JSON.stringify({ expectedPreviousHash: previousHash, expectedPreviousTitle: previousTitle, states }, null, 2))
      assert.equal(after.hash, previousHash, 'Blocking native back destroyed the previous manuscript visit')
      await eventually(async () => {
        const visiblePanes = ui.page.locator('.ws-pane').filter({ visible: true })
        const pane = (await visiblePanes.count()) === 1 ? visiblePanes : ui.page.locator('.ws-pane.focused')
        const selected = pane.locator('[role="tab"][aria-selected="true"] button[aria-label^="탭 닫기:"]')
        return (await selected.count()) === 1 && (await selected.getAttribute('aria-label')) === previousTitle
      }, 'Back reached the manuscript URL without selecting its tab')
      assert.equal(await ui.close.count(), 1, 'Returning to the previous manuscript removed the failed draft tab')
      assert.equal((await read()).content, original.content, 'The rejected history-case write changed the server file')
    } finally {
      gate.resolve()
    }
  })

  await caseOf('manual-500-close-draft-retry', async (ui) => {
    const marker = `${token}_MANUAL_500_DRAFT`
    const draft = `${originalConcept.body}\n${marker}\n`
    let failing = true
    const attempts = []
    await ui.page.route(conceptRouteURL, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      attempts.push(route.request().postDataJSON())
      if (failing) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'PR1 injected manual save failure' }) })
      return route.continue()
    })
    await replaceBody(ui, draft)
    assert.equal(attempts.length, 0, 'Typing into a manual-save concept triggered a write')
    await ui.save.click()
    await ui.pane.locator('.save-state.error').waitFor({ state: 'visible' })
    assert.equal((await readConcept()).body, originalConcept.body, 'The rejected manual write changed the file')
    await ui.close.click()
    await ui.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await retained(ui, marker)
    await ui.page.screenshot({ path: `${out}/manual-500-close-draft-retry-retained.png` })
    assert.equal(attempts.length, 1, 'Closing changed the concept manual-save policy by sending another write')
    assert(await beforeUnloadBlocked(ui.page), 'The failed concept draft lost its window-close protection')
    failing = false
    await ui.save.click()
    await ui.editor.waitFor({ state: 'hidden' })
    assert.equal((await readConcept()).body, draft, 'Manual retry failed to preserve the exact draft')
    assert.equal(await beforeUnloadBlocked(ui.page), false, 'The saved concept still blocks window closing')
    await ui.close.click()
    await eventually(async () => (await ui.close.count()) === 0, 'The manually saved concept tab could not close')
  }, openConcept)

  await caseOf('manual-409-close-external-preserved', async (ui) => {
    const marker = `${token}_MANUAL_409_DRAFT`
    const draft = `${originalConcept.body}\n${marker}\n`
    const external = `${originalConcept.body}\n${token}_MANUAL_EXTERNAL\n`
    const responses = []
    const attempts = []
    await ui.page.route(conceptRouteURL, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      attempts.push(route.request().postDataJSON())
      if (attempts.length === 1) {
        const current = await readConcept()
        await writeConcept(external, current.hash)
      }
      const response = await route.fetch()
      responses.push(response.status())
      await route.fulfill({ response })
    })
    await replaceBody(ui, draft)
    await ui.save.click()
    await ui.pane.locator('.save-state.error').waitFor({ state: 'visible' })
    assert.deepEqual(responses, [409], 'The manual save did not get an actual stale-hash 409')
    assert.equal((await readConcept()).body, external, 'The manual save overwrote the external concept edit')
    await ui.close.click()
    await ui.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await retained(ui, marker)
    await ui.page.screenshot({ path: `${out}/manual-409-close-external-preserved-retained.png` })
    assert.equal(attempts.length, 1, 'Closing retried the conflicting manual write')
    assert(await beforeUnloadBlocked(ui.page), 'The conflicting concept draft lost its window-close protection')
    assert.equal((await readConcept()).body, external, 'Closing overwrote the external concept file')
  }, openConcept)

  await caseOf('manual-inflight-new-edit-close', async (ui) => {
    const first = `${originalConcept.body}\n${token}_MANUAL_FIRST\n`
    const marker = `${token}_MANUAL_LATEST`
    const latest = `${first}${marker}\n`
    const gate = deferred()
    const started = deferred()
    const attempts = []
    let firstHash
    await ui.page.route(conceptRouteURL, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      attempts.push(route.request().postDataJSON())
      if (attempts.length === 1) {
        started.resolve()
        await gate.promise
        const response = await route.fetch()
        assert.equal(response.status(), 200, 'The first delayed manual save failed')
        firstHash = (await response.json()).hash
        return route.fulfill({ response })
      }
      return route.continue()
    })
    try {
      await replaceBody(ui, first)
      await ui.save.click()
      await Promise.race([started.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('The manual save did not start')), 10000))])
      await replaceBody(ui, latest)
      await ui.close.click()
      assert.equal(await ui.close.count(), 1, 'The concept tab closed before the manual save returned')
      await retained(ui, marker)
      gate.resolve()
      await eventually(async () => (await readConcept()).body === first, 'The first manual save did not finish')
      await eventually(() => ui.save.isEnabled(), 'The editor disappeared or stayed busy after saving the older draft')
      await retained(ui, marker)
      assert.equal(attempts.length, 1, 'Additional concept edits were automatically saved instead of retained for manual saving')
      assert(await beforeUnloadBlocked(ui.page), 'The newer unsaved concept edit lost its window-close protection')
      await ui.save.click()
      await ui.editor.waitFor({ state: 'hidden' })
      assert.equal((await readConcept()).body, latest, 'The second manual save lost the newer edit')
      assert.equal(attempts.length, 2, 'The concept did not save once per explicit action')
      assert.equal(attempts[1].baseHash, firstHash, 'The second manual save used a stale hash')
      await ui.close.click()
      await eventually(async () => (await ui.close.count()) === 0, 'The saved concept tab could not close')
    } finally {
      gate.resolve()
    }
  }, openConcept)
} finally {
  await browser.close()
  const current = await read()
  if (current.content !== original.content) await write(original.content, current.hash)
  assert.equal((await read()).content, original.content, 'The sandbox fixture was not restored')
  const concept = await readConcept()
  if (concept.body !== originalConcept.body) await writeConcept(originalConcept.body, concept.hash)
  assert.equal((await readConcept()).hash, originalConcept.hash, 'The sandbox concept fixture was not restored exactly')
  await api.dispose()
}

assert(checks.length > 0, `Unknown or missing test case: ${process.env.RW_TEST_CASE ?? '(all)'}`)
await fs.writeFile(`${out}/results.json`, JSON.stringify({ label, base: base.href, rid, file, conceptId, cases: checks.length, checks }, null, 2))
const failures = checks.filter((c) => !c.ok)
console.log(`${checks.length - failures.length}/${checks.length} passed; results: ${out}/results.json`)
process.exitCode = failures.length ? 1 : 0
