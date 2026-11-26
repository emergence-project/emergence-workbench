// 테스트 실행마다 전용 임시 폴더 하나를 만들어 TMPDIR 로 삼고, 실행이 끝나면 통째로 지운다.
//
// 왜: 서버 테스트 93개 파일이 임시 폴더에 rw-* 폴더를 만든다. 파일마다 끝에 지우지만, 실행이 중간에 죽으면
// (도구의 시간 한도, 과부하, 손으로 멈춤) afterAll · finally 가 돌지 않아 남는다. 11/20 부터 엿새 동안 1,289개 15GB 가 쌓였다 (11/26).
// 폴더 하나에 모아 두면 끝날 때 한 번에 지울 수 있고, 죽은 실행이 남긴 것은 다음 실행이 시작하면서 치운다.
//
// - vitest: apps/server/vitest.config.ts 의 globalSetup (기본 내보내기). 일꾼 프로세스는 이 뒤에 떠서 TMPDIR 를 물려받는다.
// - pnpm test: scripts/ci/test-all.mjs 가 startRunTmp 로 모든 단계(패키지 · 스크립트 테스트)를 감싼다.
// 폴더 안의 .pid 는 만든 프로세스의 번호다. 그 프로세스가 없으면 죽은 실행의 폴더로 보고 지운다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PREFIX = 'rw-testrun-'
const NO_PID_MAX_AGE = 3600_000

/** @param {number} pid */
function running(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM' // 남의 프로세스: 살아 있다
  }
}

/** base 안에서 죽은 실행이 남긴 실행 폴더를 지우고, 지운 이름을 돌려준다 @param {string} base @returns {string[]} */
export function sweepStale(base) {
  /** @type {string[]} */
  const removed = []
  let names = []
  try { names = fs.readdirSync(base) } catch { return removed }
  for (const name of names.filter((n) => n.startsWith(PREFIX)).sort()) {
    const dir = path.join(base, name)
    try {
      const pid = Number(fs.readFileSync(path.join(dir, '.pid'), 'utf8'))
      if (pid && running(pid)) continue
    } catch {
      // .pid 를 적기 전에 죽었거나 지금 막 만드는 중이다: 오래된 것만 치운다
      try { if (Date.now() - fs.statSync(dir).mtimeMs < NO_PID_MAX_AGE) continue } catch { continue }
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      removed.push(name)
    } catch { /* 다른 실행이 먼저 치우는 중 */ }
  }
  return removed
}

/**
 * 실행 폴더를 만들어 이 프로세스(와 이제부터 띄울 프로세스)의 임시 폴더로 삼는다. stop 이 지우고 되돌린다.
 * @param {string} [base] 실행 폴더를 만들 곳 (기본: 지금의 임시 폴더)
 */
export function startRunTmp(base = fs.realpathSync(os.tmpdir())) {
  sweepStale(base)
  const before = process.env.TMPDIR
  const dir = fs.mkdtempSync(path.join(base, PREFIX))
  fs.writeFileSync(path.join(dir, '.pid'), String(process.pid))
  process.env.TMPDIR = dir
  const remove = () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* 다음 실행이 치운다 */ } }
  process.once('exit', remove) // stop 없이 끝나도(process.exit · 잡히지 않은 오류) 지운다. 신호로 죽으면 다음 실행이 치운다
  return {
    dir,
    stop() {
      process.removeListener('exit', remove)
      if (before === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = before
      remove()
    },
  }
}

/** vitest globalSetup: 돌려준 함수는 모든 테스트가 끝난 뒤 불린다 */
export default function setup() {
  return startRunTmp().stop
}
