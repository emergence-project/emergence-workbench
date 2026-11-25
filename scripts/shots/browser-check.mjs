// pnpm test:browser — 예제 모드(매번 새로 만드는 .sandbox-browser)로 앱을 띄우고 브라우저 검사 둘을 돌린다.
//   누르고 적는 차례를 따라가며 본다(pnpm shots는 그림만 찍는다):
//   - input-drafts.mjs: 초안 · 검색 결과가 사라지거나 뒤바뀌지 않는지
//   - autosave-close.mjs: 저장이 실패 · 충돌 · 진행 중일 때 탭을 닫아도 고친 글이 남는지 (노트와 개념노트)
//   실패한 사례는 그 순간의 그림을 shots/<검사 이름>/<사례>.png에 남긴다. 사례 하나만: RW_TEST_CASE=<사례 이름>.
//   pnpm shots와 같게: 화면을 먼저 빌드하고(SHOTS_SKIP_BUILD=1이면 건너뜀), 브라우저는 CHROMIUM_PATH, 실제 저장소 · ~/.config는 쓰지 않는다.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const port = Number(process.env.BROWSER_CHECK_PORT ?? 8141)
const base = `http://127.0.0.1:${port}/`

/** 명령을 돌리고 끝난 코드를 돌려준다 */
function run(cmd, args) {
  return new Promise((resolve) => {
    spawn(cmd, args, { cwd: root, stdio: 'inherit' }).on('exit', (code) => resolve(code ?? 1))
  })
}

// 이미 떠 있는 서버(지난 실행의 남은 것 등)에 대고 돌리지 않게, 포트가 비어 있어야 시작한다
if (await fetch(base).then(() => true, () => false)) {
  console.error(`${base} 에 이미 서버가 떠 있습니다. 끄거나 BROWSER_CHECK_PORT로 다른 포트를 쓰세요`)
  process.exit(1)
}
if (!process.env.SHOTS_SKIP_BUILD && await run('pnpm', ['--filter', '@rw/web', 'build']) !== 0) process.exit(1)
const sandbox = path.join(root, '.sandbox-browser')
fs.rmSync(sandbox, { recursive: true, force: true })
const server = spawn(path.join(root, 'apps/server/node_modules/.bin/tsx'), ['apps/server/src/server.ts'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, RW_SANDBOX: '1', RW_SANDBOX_DIR: sandbox, RW_STATIC: '1', RW_PORT: String(port) },
})
let code = 1
try {
  let up = false
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${base}api/researches`).then((r) => r.ok, () => false)
    if (!up) await new Promise((r) => setTimeout(r, 300))
  }
  if (!up) console.error(`${base} 이 30초 안에 켜지지 않았습니다`)
  else {
    // 앞 검사가 실패해도 뒤 검사까지 돌려 한 번에 다 본다. RW_TEST_CASE로 고른 사례가 없는 검사는 건너뛴다
    code = 0
    for (const name of ['input-drafts', 'autosave-close']) {
      const file = path.join(root, `scripts/shots/${name}.mjs`)
      if (process.env.RW_TEST_CASE && !fs.readFileSync(file, 'utf8').includes(process.env.RW_TEST_CASE.replace(/^concept-/, ''))) continue
      console.log(`\n▶ ${name}`)
      if (await run(process.execPath, [file, base]) !== 0) code = 1
    }
  }
} finally {
  // 서버가 내려간 뒤에 끝낸다: 바로 다시 돌릴 때 "이미 서버가 떠 있습니다"에 걸리지 않게 (5초 넘게 버티면 그냥 끝낸다)
  await new Promise((r) => { server.once('exit', r); server.kill(); setTimeout(r, 5000).unref() })
}
process.exit(code)
