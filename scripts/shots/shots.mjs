// pnpm shots — 개발용 예제 모드(.sandbox)로 앱을 띄워 주요 화면을 찍고, 화면마다 오류 없이 그려지는지 확인한다.
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
import { clearAgentEdits, seedAgentEdits } from './agent-edits.mjs'

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
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} → ${code}`))))
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

if (!process.env.SHOTS_SKIP_BUILD) await run('pnpm', ['--filter', '@rw/web', 'build'])
const server = spawn(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/server/src/server.ts'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, RW_SANDBOX: '1', RW_SUBJECTS_FIXTURE: options.sample === 'subjects' ? '1' : '', RW_STATIC: '1', RW_PORT: String(port), RW_SAMPLE_LANG: options.lang === 'en' ? 'en' : '' },
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
  const page = await browser.newPage({ viewport: options.viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: screenScheme(options.theme, SCREENS[0][0]) })
  // Start in the capture language, so the first screen does not load in the browser language and reload (i18n.ts)
  await page.addInitScript((language) => { try { if (!localStorage.getItem('rw-ui')) localStorage.setItem('rw-ui', JSON.stringify({ language })) } catch { /* ignore */ } }, options.lang)
  let current = ''
  page.on('pageerror', (e) => problems.push(`${current}: ${e.message}`))
  // 아직 컴파일하지 않은 블록의 PDF는 404가 정상이다 (TeX가 없는 곳에서는 늘 그렇다)
  const expected = (m) => /\/pdf(\?|$)/.test(m.location().url ?? '') && m.text().includes('404')
  page.on('console', (m) => { if (m.type() === 'error' && !expected(m)) problems.push(`${current}: console ${m.text()} ${m.location().url ?? ''}`) })
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
    if (name === 'review') {
      const why = await seedAgentEdits(base, rid, options.lang)
      if (why) problems.push(`${name}: 예제 고침을 넣지 못함 (${why})`)
    }
    await page.goto(base + hash.replace('{rid}', encodeURIComponent(rid)))
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' })
    await page.waitForLoadState('networkidle')
    if (name === 'paper-open' || name === 'paper-open-paint') {
      // Wait before opening the paint menu, too: its overlay can appear before the page is drawn.
      // pdf.js may be unavailable in the capture environment, so this bounded wait is non-fatal.
      await page.waitForFunction(() => {
        const first = [...document.querySelectorAll('[data-ui="PDF"] .pdf-page[data-page="1"]')]
          .find((el) => el.getClientRects().length > 0)
        const canvas = first?.querySelector('canvas')
        if (!canvas || !first.querySelector('.pdf-text span') || !canvas.width || !canvas.height) return false
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        // A newly mounted or freshly sized canvas is still transparent; a white fill alone is not a page.
        return pixels?.some((alpha, i) => i % 4 === 3 && alpha > 0 && Math.min(pixels[i - 3], pixels[i - 2], pixels[i - 1]) < 240)
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
    if (ui) await page.locator(`[data-ui="${ui}"]`).filter({ visible: true }).first().waitFor({ timeout: 10_000 }).catch(() => problems.push(`${name}: [data-ui="${ui}"] 없음`))
    if (name === 'project') {
      await page.locator('[data-ui="최근 손댄 노트"] [data-ui="노트 카드"]').filter({ visible: true }).first().waitFor({ timeout: 10_000 })
        .catch(() => problems.push(`${name}: 노트 자료가 아직 없음`))
      await page.locator('[data-ui="주제 카드 목록"] [data-ui="주제 카드"]').filter({ visible: true }).first().waitFor({ timeout: 10_000 })
        .catch(() => problems.push(`${name}: 주제 자료가 아직 없음`))
    }
    if (name === 'info') {
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
          if (/[가-힣]/.test(n.textContent)) lines.add(n.textContent.trim().slice(0, 80))
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
    if (name === 'review') await clearAgentEdits(base)
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
