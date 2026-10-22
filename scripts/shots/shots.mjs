// pnpm shots — 개발용 예제 모드(매번 새로 만드는 .sandbox-shots)로 앱을 띄워 주요 화면을 찍고, 화면마다 오류 없이 그려지는지 확인한다.
//   찍은 그림: shots/<화면>.png (저장소에 넣지 않는다). 하나라도 오류가 나면 실패로 끝난다.
//   실제 연구 저장소·~/.config는 쓰지 않는다 (RW_SANDBOX=1).
//   브라우저: CHROMIUM_PATH, 없으면 playwright-core가 아는 chromium (CI는 실행기에 깔린 Chrome).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { parseShotOptions, screenScheme, SHOTS_HELP } from './options.mjs'
import { selectScreens } from './screens.mjs'
import { clearAgentEdits, seedAgentEdits, seedEditTalk } from './agent-edits.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.resolve(process.env.SHOTS_DIR ?? path.join(root, 'shots'))
const port = Number(process.env.SHOTS_PORT ?? 8139)
const base = `http://127.0.0.1:${port}/`

const options = parseShotOptions(process.argv.slice(2))
if (options.help) { console.log(SHOTS_HELP); process.exit(0) }
const SCREENS = selectScreens(options.sample)
console.log(`화면 검사: ${options.viewport.width}×${options.viewport.height} · ${options.theme} · ${options.sample} · ${SCREENS.length}개`)

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
    p.on('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`${cmd} ${args.join(' ')} → ${code}`))))
  })
}

async function waitUp(url, ms = 30_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${url} 이 ${ms / 1000}초 안에 켜지지 않았습니다`)
}

// 이미 떠 있는 서버(지난 실행의 남은 것 등)를 찍지 않게, 포트가 비어 있어야 시작한다
if (await fetch(base).then(() => true, () => false)) {
  console.error(`${base} 에 이미 서버가 떠 있습니다. 끄거나 SHOTS_PORT로 다른 포트를 쓰세요`)
  process.exit(1)
}
if (!process.env.SHOTS_SKIP_BUILD) await run('pnpm', ['--filter', '@rw/web', 'build'])
// 예제는 매번 fixtures에서 새로 만든다. 개발용 .sandbox/는 처음 한 번만 복사해서, fixtures가 바뀐 뒤에는 낡은 예제를 찍게 된다
const sandbox = path.join(root, options.lang === 'en' ? '.sandbox-shots-en' : '.sandbox-shots')
fs.rmSync(sandbox, { recursive: true, force: true })
const server = spawn(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/server/src/server.ts'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, RW_SANDBOX: '1', RW_SANDBOX_DIR: sandbox, RW_SUBJECTS_FIXTURE: options.sample === 'subjects' ? '1' : '', RW_STATIC: '1', RW_PORT: String(port), RW_SAMPLE_LANG: options.lang === 'en' ? 'en' : '' },
})
const problems = []
const hangul = []
try {
  await waitUp(`${base}api/researches`)
  const { researches } = await (await fetch(`${base}api/researches`)).json()
  const rid = researches[0]?.id
  if (!rid) throw new Error('예제 연구가 등록되지 않았습니다')

  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const page = await browser.newPage({ viewport: options.viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: screenScheme(options.theme, SCREENS[0]?.[0] ?? '') })
  // Start in the capture language, so the first screen does not load in the browser language and reload (i18n.ts)
  await page.addInitScript((language) => { try { if (!localStorage.getItem('rw-ui')) localStorage.setItem('rw-ui', JSON.stringify({ language })) } catch { /* ignore */ } }, options.lang)
  let current = ''
  page.on('pageerror', (e) => problems.push(`${current}: ${e.message}`))
  // 아직 컴파일하지 않은 블록의 PDF는 404가 정상이다 (TeX가 없는 곳에서는 늘 그렇다)
  const expected = (m) => /\/pdf(\?|$)/.test(m.location().url ?? '') && m.text().includes('404')
  page.on('console', (m) => { if (m.type() === 'error' && !expected(m)) problems.push(`${current}: console ${m.text()} ${m.location().url ?? ''}`) })
  let chat = ''
  let done = ''
  let appchat = ''
  for (const [name, hash, ui, click] of SCREENS) {
    current = name
    if (name === 'dark-topic') {
      await page.evaluate((id) => {
        localStorage.removeItem(`rw-ws-${id}`)
        localStorage.removeItem(`rw-side-refs-${id}`)
      }, rid)
      // A hash-only navigation retains React state, so load a fresh document too.
      await page.goto('about:blank')
    }
    await page.emulateMedia({ colorScheme: screenScheme(options.theme, name) })
    if (name === 'review' || name === 'review-talk') {
      // review와 주소가 같아 주소만 바꾸면 화면이 그대로라, 새로 연다
      if (name === 'review-talk') await page.goto('about:blank')
      const why = await seedAgentEdits(base, rid, options.lang) ?? (name === 'review-talk' ? await seedEditTalk(base, rid, options.lang) : null)
      if (why) problems.push(`${name}: 예제 고침을 넣지 못함 (${why})`)
    }
    // 앞 화면(노트 고치기)과 주소가 같아 편집기가 남지 않게 새로 연다
    if (name === 'figure-zoom') await page.goto('about:blank')
    // 앱 고치기 대화는 찍기 직전에 만들어, 앞 화면에서 받아 둔 대화 목록이 남지 않게 새로 연다
    if (name === 'agent-app') await page.goto('about:blank')
    if (hash.includes('{chat}') && !chat) {
      // 허락을 기다리는 대화 하나 (예제 실행기가 "계산"을 보면 명령을 묻는다)
      const res = await fetch(`${base}api/agent-chats`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rw-lang': options.lang }, body: JSON.stringify({ rid, text: options.lang === 'en' ? 'Rerun the check computation in the Kempe note' : '켐페 노트의 확인 계산을 다시 돌려 줘', scope: { kind: 'project' }, mode: 'plan' }) })
      chat = res.ok ? (await res.json()).chat.id : ''
      if (!chat) problems.push(`${name}: 예제 대화를 만들지 못함 (${res.status})`)
      for (let i = 0; chat && i < 50; i++) {
        const c = await (await fetch(`${base}api/agent-chats/${chat}`)).json()
        if (c.chat.state === 'waiting') break
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (hash.includes('{done}') && !done) {
      // 노트를 고치고 끝난 대화 하나 (고치기 바로: 명령 허락에 "네"로 답한다). 바뀐 곳 패널을 보이려고
      const res = await fetch(`${base}api/agent-chats`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rw-lang': options.lang }, body: JSON.stringify({ rid, text: options.lang === 'en' ? 'Run the Kempe check up to degree 5' : '켐페 확인 계산을 차수 5까지 돌려 줘', scope: { kind: 'project' }, mode: 'edit' }) })
      done = res.ok ? (await res.json()).chat.id : ''
      if (!done) problems.push(`${name}: 예제 대화를 만들지 못함 (${res.status})`)
      for (let i = 0; done && i < 80; i++) {
        const c = (await (await fetch(`${base}api/agent-chats/${done}`)).json()).chat
        const open = c.items.find((x) => x.kind === 'ask' && !x.answer)
        if (open) await fetch(`${base}api/agent-chats/${done}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask: open.id, answer: 'allow' }) })
        else if (c.state === 'idle') break
        await new Promise((r) => setTimeout(r, 100))
      }
      // 곁 질문 하나 (작은 모델이 대화 요약만 보고 답하는 점선 카드)
      if (done) {
        await fetch(`${base}api/agent-chats/${done}/side`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: options.lang === 'en' ? 'Which degree did the note check before?' : '노트는 원래 차수 몇까지 확인했어?' }) })
        for (let i = 0; i < 40; i++) {
          const c = (await (await fetch(`${base}api/agent-chats/${done}`)).json()).chat
          if (c.items.some((x) => x.kind === 'side' && (x.answer || x.error))) break
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    }
    if (hash.includes('{appchat}') && !appchat) {
      // 앱 고치기 대화 하나 (2단계): 예제 실행기가 파일 하나를 고치고, 앱 MCP가 하듯 PR 올리기를 부른다 (예제 작업 폴더는 정해 둔 PR #234)
      const res = await fetch(`${base}api/agent-chats`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rw-lang': options.lang }, body: JSON.stringify({ rid: '_app', text: options.lang === 'en' ? 'The export menu in the note toolbar is cut off at the right edge' : '노트 툴바의 내보내기 메뉴가 화면 오른쪽에서 잘린다', mode: 'edit' }) })
      appchat = res.ok ? (await res.json()).chat.id : ''
      if (!appchat) problems.push(`${name}: 예제 앱 고치기 대화를 만들지 못함 (${res.status})`)
      for (let i = 0; appchat && i < 50; i++) {
        const c = (await (await fetch(`${base}api/agent-chats/${appchat}`)).json()).chat
        if (c.state === 'idle') break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (appchat) await fetch(`${base}api/agent-chats/${appchat}/app/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: options.lang === 'en' ? 'Keep the note export menu inside the screen' : '노트 툴바 내보내기 메뉴가 화면 오른쪽에서 잘리지 않게', body: '## Before' }) })
    }
    if (name === 'feedback-agent') {
      // 피드백 맡기기 (2단계 나): 수정 요청이 온 항목을 앱 고치기 대화에 맡기고, 앱 MCP가 하듯 PR 올리기와 처리 기록(feedback_answer)을 부른다
      await page.goto('about:blank')
      const json = { 'content-type': 'application/json', 'x-rw-lang': options.lang }
      const res = await fetch(`${base}api/feedback/hand-off`, { method: 'POST', headers: json, body: JSON.stringify({ key: '2026-10-04 10:15 사이드바 › 목차' }) })
      const id = res.ok ? (await res.json()).chat.id : ''
      if (!id) problems.push(`${name}: 피드백을 맡기지 못함 (${res.status})`)
      for (let i = 0; id && i < 50; i++) {
        const c = (await (await fetch(`${base}api/agent-chats/${id}`)).json()).chat
        if (c.state === 'idle') break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (id) {
        await fetch(`${base}api/agent-chats/${id}/app/submit`, { method: 'POST', headers: json, body: JSON.stringify({ title: options.lang === 'en' ? 'Let the outline width be dragged' : '목차 너비를 끌어서 바꾸게', body: '## Before' }) })
        const en = options.lang === 'en'
        const r = await fetch(`${base}api/agent-chats/${id}/feedback/answer`, { method: 'POST', headers: json, body: JSON.stringify({
          state: '반영',
          note: en ? 'Fixed (#234)\nDrag the right edge of the outline to change its width.' : '수정 완료 (#234)\n목차 오른쪽 경계를 끌어 너비를 바꿀 수 있게 했습니다.',
          understood: en ? 'Make the outline width adjustable by dragging.' : '목차 너비를 끌어서 바꿀 수 있게 한다.',
          miss: '덜 고침',
          lesson: en ? 'Check the narrow width before saying it is fixed.' : '고쳤다고 하기 전에 좁은 폭에서도 본다.',
        }) })
        if (!r.ok) problems.push(`${name}: 처리 기록을 적지 못함 (${r.status})`)
      }
    }
    if (name === 'agent-dock' || name === 'agent-beside') {
      // 패널 자리 (아래 · 나란히): 새 문서로 열어 패널을 닫힌 채 시작하고, 아래 자리는 설정으로, 나란히는 끝난 대화를 연 채로
      await page.goto('about:blank')
      await page.goto(base)
      await page.evaluate(({ rid, done, bottom }) => {
        localStorage.setItem('rw-agent-place', JSON.stringify(bottom ? 'bottom' : 'right'))
        localStorage.setItem(`rw-agent-panel-${rid}`, JSON.stringify(bottom ? null : done))
        localStorage.removeItem(`rw-ws-${rid}`)
      }, { rid, done, bottom: name === 'agent-dock' })
      await page.goto('about:blank')
    }
    await page.goto(base + hash.replace('{rid}', encodeURIComponent(rid)).replace('{chat}', encodeURIComponent(chat)).replace('{done}', encodeURIComponent(done)).replace('{appchat}', encodeURIComponent(appchat)))
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' })
    await page.waitForLoadState('networkidle')
    if (name === 'paper-open' || name === 'paper-open-paint') {
      // Wait before opening the paint menu, too: its overlay can appear before the page is drawn.
      // pdf.js may be unavailable in the capture environment, so this bounded wait is non-fatal.
      await page.waitForFunction(() => {
        const first = [...document.querySelectorAll('[data-ui="PDF"] .pdf-page[data-page="1"]')]
          .find((el) => el.getClientRects().length > 0)
        const canvas = first?.querySelector('canvas')
        if (!canvas || !first?.querySelector('.pdf-text span') || !canvas.width || !canvas.height) return false
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        // A newly mounted or freshly sized canvas is still transparent; a white fill alone is not a page.
        return pixels?.some((alpha, i) => i % 4 === 3 && alpha > 0 && Math.min(pixels[i - 3] ?? 255, pixels[i - 2] ?? 255, pixels[i - 1] ?? 255) < 240)
      }, undefined, { timeout: 10_000, polling: 250 }).catch(() => {})
    }
    // 누를 부위는 하나 또는 차례로 여럿. '['로 시작하면 그대로 선택자로 쓴다. '!'로 시작하면 다른 것에 가려 있어도 그 자리를 누른다
    for (const c0 of [click ?? []].flat()) {
      const force = c0.startsWith('!')
      const c = force ? c0.slice(1) : c0
      const sel = c.startsWith('[') ? c : `[data-ui="${c}"]`
      // 숨은 탭(열어 둔 다른 노트)에도 같은 부위가 있으니 보이는 것을 누른다
      await page.locator(sel).filter({ visible: true }).first().click({ timeout: 10_000, force }).catch(() => problems.push(`${name}: ${sel}를 누르지 못함`))
    }
    const uiSel = ui && (ui.startsWith('[') ? ui : `[data-ui="${ui}"]`)
    if (uiSel) await page.locator(uiSel).filter({ visible: true }).first().waitFor({ timeout: 10_000 }).catch(() => problems.push(`${name}: ${uiSel} 없음`))
    // 대화는 줄 아래에 열려 첫 화면 밖이라, 그 바뀐 곳부터 보이게 내린다
    if (name === 'review-talk') await page.locator('[data-ui="바뀐 곳"]').filter({ has: page.locator('[data-ui="고친 이유"]') }).first().evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => problems.push(`${name}: 대화까지 내리지 못함`))
    if (name === 'project') {
      await page.locator('[data-ui="최근 손댄 노트"] [data-ui="노트 카드"]').filter({ visible: true }).first().waitFor({ timeout: 10_000 })
        .catch(() => problems.push(`${name}: 노트 자료가 아직 없음`))
      await page.locator('[data-ui="주제 카드 목록"] [data-ui="주제 카드"]').filter({ visible: true }).first().waitFor({ timeout: 10_000 })
        .catch(() => problems.push(`${name}: 주제 자료가 아직 없음`))
    }
    if (name === 'info-status') {
      await page.waitForFunction(() => [...document.querySelectorAll('[data-ui="현황 쪽"] .info-sec')].every((el) => !/읽는 중…|Loading…|…$/.test(el.textContent.trim())), undefined, { timeout: 10_000 })
        .catch(() => problems.push(`${name}: 현황을 아직 읽는 중`))
    }
    if (name === 'info-repo') {
      await page.waitForFunction(() => {
        const repo = document.querySelector('[data-ui="저장소 정보"]')
        return repo?.querySelector('dd') && !/읽는 중…|Loading…|Reading…/.test(repo.textContent)
      }, undefined, { timeout: 10_000 }).catch(() => problems.push(`${name}: 저장소 정보를 아직 읽는 중`))
    }
    // English capture: list Korean left on the screen (sample text aside) so it can be translated
    if (options.lang === 'en') {
      const left = await page.evaluate(() => {
        const lines = new Set()
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const el = n.parentElement
          if (!el || !el.getClientRects().length || el.closest('.cm-editor, .note-body, .md-body, .pdf-page, svg')) continue
          if (/[가-힣]/.test(n.textContent ?? '')) lines.add((n.textContent ?? '').trim().slice(0, 80))
        }
        for (const el of document.querySelectorAll('[title], [aria-label], [placeholder], [data-tip]')) {
          for (const a of ['title', 'aria-label', 'placeholder', 'data-tip']) { const v = el.getAttribute(a); if (v && /[가-힣]/.test(v)) lines.add(`@${a}: ${v.slice(0, 80)}`) }
        }
        return [...lines]
      })
      if (left.length) hangul.push(`${name}:\n    ${left.join('\n    ')}`)
    }
    if (name === 'latex') {
      const card = page.locator('[data-ui="서식 카드"]').first()
      await card.scrollIntoViewIfNeeded({ timeout: 10_000 })
        .catch(() => problems.push(`${name}: 서식 카드까지 스크롤하지 못함`))
      // 미리보기는 TeX가 있어야 그려진다(CI 리눅스에는 없음): 있으면 기다리고, 없으면 그대로 찍는다
      await card.locator('[data-ui="서식 미리보기"] canvas').waitFor({ state: 'visible', timeout: process.env.CI ? 5_000 : 60_000 }).catch(() => {})
    }
    if (!(await page.locator('#root *').count())) problems.push(`${name}: 빈 화면`)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: path.join(out, `${name}.png`) })
    // 주소만 바꾸는 이동은 열린 창을 그대로 두므로, 다음 화면을 가리지 않게 닫는다
    if (name === 'task-dialog') await page.keyboard.press('Escape')
    // 패널 자리와 나란히 연 탭을 되돌려 뒤 화면이 같게
    if (name === 'agent-dock' || name === 'agent-beside') {
      await page.evaluate((rid) => { localStorage.removeItem('rw-agent-place'); localStorage.removeItem(`rw-agent-panel-${rid}`); localStorage.removeItem(`rw-ws-${rid}`) }, rid)
      await page.goto('about:blank')
    }
    if (name === 'review' || name === 'review-talk') await clearAgentEdits(base)
    console.log(`찍음 ${name}`)
  }
  await browser.close()
} finally {
  server.kill()
}
if (hangul.length) console.log(`\nKorean left on English screens (${hangul.length} screens):\n${hangul.join('\n')}`)
if (problems.length) {
  console.error(`\n화면 오류 ${problems.length}건:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}
console.log(`\n화면 ${SCREENS.length}개를 찍었습니다: ${path.relative(root, out)}/`)
