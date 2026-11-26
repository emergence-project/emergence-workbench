#!/usr/bin/env node
// pnpm agent:contained — 생성한 셸 명령을 가둬서 돌린다 (CLAUDE.md "생성한 명령을 실제로 돌릴 때").
//
// 왜: 2026-11-26, 판정기 검토용 퍼저가 spawnSync(셸, …, { timeout })으로 무작위 명령을 돌렸다. 시간 한도는 셸만 죽였고,
// 셸이 띄운 cat 78개가 남아 몇 시간 동안 자기가 읽는 파일에 다시 써서 364GB를 채웠다. 그래서 여기서는:
//   1. 파일 크기 · CPU 시간 상한(ulimit -f · -t)을 셸 밖에서 걸고 exec 한다. 하드 상한이라 명령이 다시 올리지 못하고,
//      묶음이나 환경을 벗어난 프로세스에도 그대로 물려진다.
//   2. 셸을 새 프로세스 묶음으로 띄우고, 시간 한도에서뿐 아니라 셸이 스스로 끝난 뒤에도 매번 묶음 전체를 죽인다
//      (뒤로 돌린 `&`는 셸이 끝나도 남는다).
//   3. 묶음을 벗어난 프로세스(set -m, setsid)는 작업 폴더가 실행 폴더 안인 것(맥 lsof, 리눅스 /proc)과
//      환경 변수 꼬리표 RW_CONTAINED(리눅스. 맥의 ps 는 환경을 보여 주지 않는다)로 찾아 죽인다.
//   4. 실행마다 새 폴더에서 돌리고 끝나면 지운다. 남은 공간이 모자라면 시작하지 않는다.
// 못 막는 것: 묶음을 벗어나고 폴더도 옮긴(맥) 프로세스는 찾지 못한다. 그래도 1의 상한 안에서만 쓴다.
// 덧붙여 쓰는(>>) 프로세스가 겹치면 맥에서는 파일이 상한을 조금 넘는다(1MB 상한에서 1.5MB까지 보았다).
//
// 쓰기:
//   pnpm agent:contained -- 'yes > f & sleep 1'               명령 하나
//   pnpm agent:contained --jobs jobs.json [--parallel 4]      [{ "id": "a", "shell": "zsh", "cmd": "…", "timeoutMs": 4000 }, …]
//   옵션: --shell bash|zsh  --timeout <ms>  --file-mb <n>  --cpu <초>
// 결과는 한 줄에 하나씩 JSON(id · code · signal · timedOut · stdout · stderr · files), 끝에 stderr로 요약.
// 남은 프로세스가 있으면 1로 끝난다. 코드에서는 import { runContained } from '…/scripts/agent-contained.mjs'.
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TAG = 'RW_CONTAINED'

/**
 * @typedef {object} ContainedOptions
 * @property {string} [shell] bash · zsh 또는 셸의 경로 (기본 /bin/bash)
 * @property {number} [timeoutMs] 시간 한도 (기본 4000)
 * @property {number} [fileMb] 파일 하나의 크기 상한 MB (기본 10)
 * @property {number} [cpuSeconds] 프로세스 하나의 CPU 시간 상한 (기본 30)
 * @property {number} [maxOutput] stdout · stderr 를 각각 이 글자 수까지만 받는다 (기본 65536)
 * @property {number} [minFreeGb] 남은 공간이 이보다 적으면 돌리지 않는다 (기본 5)
 * @property {string} [base] 실행 폴더를 만들 곳 (기본 임시 폴더)
 * @property {Record<string, string>} [env] 더할 환경 변수
 * @property {boolean} [sweep] false 면 묶음만 죽이고 벗어난 프로세스 찾기는 건너뛴다: 여러 개를 돌리고 base 로 한 번에 strays 를 부를 때 (기본 true)
 *
 * @typedef {object} ContainedResult
 * @property {number | null} code
 * @property {string | null} signal
 * @property {boolean} timedOut
 * @property {string} stdout
 * @property {string} stderr
 * @property {Record<string, number>} files 실행 폴더에 남은 파일과 크기 (지우기 전)
 * @property {number[]} leftover 죽지 않고 남은 프로세스
 * @property {string} dir 실행 폴더 (이미 지워짐)
 */

/**
 * 작업 폴더가 dirs 가운데 하나의 안이거나(지워진 폴더도 잡힌다) 환경에 꼬리표가 있는, 살아 있는 프로세스
 * @param {string | string[]} dirs @param {string} [tag] @returns {number[]}
 */
export function strays(dirs, tag) {
  const list = [dirs].flat()
  const inside = (/** @type {string} */ cwd) => list.some((dir) => cwd === dir || cwd.startsWith(`${dir}/`) || cwd.startsWith(`${dir} (deleted)`))
  /** @type {number[]} */
  const pids = []
  if (fs.existsSync('/proc/self/environ')) {
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name) || Number(name) === process.pid) continue
      try {
        if (inside(fs.readlinkSync(`/proc/${name}/cwd`)) || (tag && fs.readFileSync(`/proc/${name}/environ`, 'latin1').split('\0').includes(`${TAG}=${tag}`))) pids.push(Number(name))
      } catch { /* 끝났거나 남의 프로세스 */ }
    }
    return pids
  }
  // macOS: lsof 한 번으로 모든 프로세스의 작업 폴더를 본다 (p<pid> 줄 다음에 n<경로> 줄)
  const out = spawnSync('lsof', ['-a', '-d', 'cwd', '-Fpn'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? ''
  let pid = 0
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n' && pid !== process.pid && inside(line.slice(1))) pids.push(pid)
  }
  return pids
}

/** @param {number} pid */
const kill = (pid) => { try { process.kill(pid, 'SIGKILL') } catch { /* 이미 없음 */ } }
/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 그 폴더들에서 돌다 남은 프로세스를 모두 죽인다. killed 는 죽인 수, left 는 그래도 남은 것
 * @param {string | string[]} dirs @param {string} [tag]
 */
export async function sweep(dirs, tag) {
  let left = strays(dirs, tag)
  const killed = left.length
  for (let n = 0; left.length && n < 40; n++) {
    left.forEach(kill)
    await sleep(25)
    left = strays(dirs, tag)
  }
  return { killed, left }
}

/** @param {string} dir @returns {Record<string, number>} */
function filesIn(dir) {
  /** @type {Record<string, number>} */
  const files = {}
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).slice(0, 200)) {
      if (e.isFile()) files[e.name] = fs.statSync(path.join(dir, e.name)).size
    }
  } catch { /* 명령이 폴더를 지웠다 */ }
  return files
}

/**
 * 명령 글 하나를 새 폴더에서 가둬 돌리고, 끝나면 남은 프로세스를 죽이고 폴더를 지운다.
 * @param {string} text @param {ContainedOptions} [opts] @returns {Promise<ContainedResult>}
 */
export async function runContained(text, opts = {}) {
  const shell = opts.shell?.includes('/') ? opts.shell : `/bin/${opts.shell ?? 'bash'}`
  const { timeoutMs = 4000, fileMb = 10, cpuSeconds = 30, maxOutput = 65536, minFreeGb = 5 } = opts
  const base = fs.realpathSync(opts.base ?? os.tmpdir()) // lsof · /proc 이 알리는 경로와 견주려고 실제 경로로
  const free = fs.statfsSync(base)
  const freeGb = (free.bavail * free.bsize) / 1024 ** 3
  if (freeGb < minFreeGb) throw new Error(`남은 공간이 ${freeGb.toFixed(1)}GB로 ${minFreeGb}GB보다 적어 돌리지 않습니다 (${base})`)
  const dir = fs.mkdtempSync(path.join(base, 'rw-contained-'))
  const tag = crypto.randomBytes(8).toString('hex')
  // 상한은 bash 가 걸고(-f 는 1024바이트 단위, 하드 · 소프트 둘 다) 고른 셸로 exec 한다: 명령 글은 한 글자도 바뀌지 않는다
  const limits = `ulimit -f ${Math.max(1, Math.floor(fileMb * 1024))}; ulimit -t ${Math.max(1, Math.floor(cpuSeconds))} 2>/dev/null; exec "$@"`
  const child = spawn('/bin/bash', ['-c', limits, 'contained', shell, '-c', text], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: dir, LANG: 'en_US.UTF-8', ...opts.env, [TAG]: tag },
  })
  const out = { stdout: '', stderr: '' }
  for (const k of /** @type {const} */ (['stdout', 'stderr'])) {
    const stream = child[k]
    stream.setEncoding('utf8')
    stream.on('data', (/** @type {string} */ d) => {
      out[k] = (out[k] + d).slice(0, maxOutput)
      if (out[k].length >= maxOutput) stream.destroy()
    })
    stream.on('error', () => {})
  }
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; if (child.pid) kill(-child.pid) }, timeoutMs)
  /** @type {{ code: number | null, signal: string | null }} */
  const end = await new Promise((resolve) => {
    child.on('error', () => resolve({ code: null, signal: null }))
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  clearTimeout(timer)
  if (child.pid) kill(-child.pid)
  const leftover = opts.sweep === false ? [] : (await sweep(dir, tag)).left
  // 남은 출력을 마저 받는다 (쓰던 쪽은 모두 죽었다)
  await Promise.all([child.stdout, child.stderr].map((s) => s.destroyed || s.readableEnded ? null : new Promise((r) => { s.once('close', r); setTimeout(r, 200) })))
  child.stdout.destroy()
  child.stderr.destroy()
  const files = filesIn(dir)
  fs.rmSync(dir, { recursive: true, force: true })
  return { ...end, timedOut, ...out, files, leftover, dir }
}

async function main() {
  const argv = process.argv.slice(2)
  /** @type {ContainedOptions} */
  const opts = {}
  let jobsFile = ''
  let parallel = 1
  /** @type {string[]} */
  let rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') { rest = argv.slice(i + 1); break }
    else if (a === undefined) continue
    else if (a === '--jobs') jobsFile = argv[++i] ?? ''
    else if (a === '--parallel') parallel = Math.max(1, Number(argv[++i]) || 1)
    else if (a === '--shell') opts.shell = argv[++i]
    else if (a === '--timeout') opts.timeoutMs = Number(argv[++i])
    else if (a === '--file-mb') opts.fileMb = Number(argv[++i])
    else if (a === '--cpu') opts.cpuSeconds = Number(argv[++i])
    else rest.push(a)
  }
  /** @type {({ id?: string | number, cmd: string } & ContainedOptions)[]} */
  const jobs = jobsFile ? JSON.parse(fs.readFileSync(jobsFile, 'utf8')) : rest.length ? [{ cmd: rest.join(' ') }] : []
  if (!jobs.length) {
    console.error("쓰기: pnpm agent:contained -- '<명령>'  또는  pnpm agent:contained --jobs <jobs.json> [--parallel n] [--shell bash|zsh] [--timeout ms] [--file-mb n] [--cpu 초]")
    process.exit(2)
  }
  // 실행마다 lsof 를 부르면 느리다: 작업 폴더를 한 폴더 아래에 두고, 끝난 실행 100개마다와 맨 끝에 한 번에 찾는다
  // (도는 중인 실행의 프로세스를 죽이지 않게, 중간에는 끝난 실행의 폴더만 본다)
  const batch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-contained-batch-'))
  let timedOut = 0
  let killed = 0
  let next = 0
  /** @type {string[]} */
  let ended = []
  /** @type {string[]} */
  const lines = []
  let printed = 0
  const worker = async () => {
    while (next < jobs.length) {
      const n = next++
      const job = jobs[n]
      if (!job) continue
      const { id = n, cmd, ...own } = job
      const r = await runContained(cmd, { ...opts, ...own, base: batch, sweep: false })
      if (r.timedOut) timedOut++
      ended.push(r.dir)
      if (ended.length >= 100) {
        const dirs = ended
        ended = []
        killed += (await sweep(dirs)).killed
      }
      const { dir: _dir, leftover: _left, ...shown } = r
      lines[n] = JSON.stringify({ id, ...shown })
      while (lines[printed] !== undefined) console.log(lines[printed++]) // 작업 차례대로 적는다
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, worker))
  const last = await sweep(batch)
  fs.rmSync(batch, { recursive: true, force: true })
  console.error(`실행 ${jobs.length}개 · 시간 한도 ${timedOut}개 · 묶음을 벗어나 따로 죽인 프로세스 ${killed + last.killed}개 · 남은 프로세스 ${last.left.length}`)
  process.exit(last.left.length ? 1 : 0)
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
