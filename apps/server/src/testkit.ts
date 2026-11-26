// 서버 테스트가 함께 쓰는 것: 예제 연구, 임시 폴더, 예제 연구를 등록한 앱
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { afterAll, beforeAll, expect, vi } from 'vitest'
import { DEFAULT_AUTHORS } from '@rw/core'
import { buildApp } from './app.js'

export const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/sample-research')
const latexmk = (() => { try { execFileSync('latexmk', ['-v']); return true } catch { return false } })()
/**
 * 앱의 서식(prl · prb · 연구노트)이 쓰는 클래스 · 패키지 가운데 이 컴퓨터의 TeX에 없는 것 (11/26 "이 맥에서 pnpm test").
 * TeX를 작게 깐 컴퓨터(TinyTeX 등)는 latexmk는 있어도 revtex · physics 같은 것이 없어, 컴파일 테스트가 「Emergency stop」으로 떨어졌다.
 * 무엇이 필요한지는 서식에서 읽는다(packages/core의 기본 서식 · templates/latex의 연구노트 스타일): 서식을 바꾸면 이 목록도 따라온다
 */
export const texMissing: string[] = (() => {
  if (!latexmk) return []
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
  // 주석 줄(예로 든 \usepackage{name})은 빼고 읽는다. rw-로 시작하는 것은 앱이 빌드 폴더에 넣어 주는 자기 스타일이라 TeX에 없어도 된다
  const text = [path.join(root, 'packages/core/src/latex-setup.ts'), path.join(root, 'templates/latex/rw-research-note.sty')]
    .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')).filter((l) => !/^\s*(\/\*\*|\*|\/\/|%)/.test(l)).join('\n')
  const need = new Set<string>()
  for (const m of text.matchAll(/\\+documentclass(?:\[[^\]]*\])?\{([\w-]+)\}/g)) need.add(`${m[1]}.cls`)
  for (const m of text.matchAll(/\\+(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g)) for (const p of m[1]!.split(',')) if (/^[\w-]+$/.test(p.trim()) && !p.trim().startsWith('rw-')) need.add(`${p.trim()}.sty`)
  // kpsewhich는 찾은 것만 한 줄씩 적는다 (하나라도 없으면 종료 코드가 0이 아니다)
  const found = spawnSync('kpsewhich', [...need], { encoding: 'utf8' }).stdout ?? ''
  const have = new Set(found.split('\n').map((l) => path.basename(l.trim())))
  return [...need].filter((f) => !have.has(f)).sort()
})()
/** 컴파일 테스트를 돌릴 수 있는가: latexmk가 있고 서식이 쓰는 것이 다 있다. 아니면 건너뛴다(CI의 TeX 검사 tex.yml은 RW_REQUIRE_TEX로 건너뛰지 못하게 한다) */
export const hasLatex = latexmk && texMissing.length === 0
if (process.env.RW_REQUIRE_TEX && !hasLatex) throw new Error(latexmk ? `TeX is missing what the templates use: ${texMissing.join(', ')}` : 'latexmk is not installed')
// vitest는 테스트 파일마다 이 모듈을 따로 읽고 console을 가로챈다: 표준 오류에 바로, 파일마다 한 번 적는다
if (latexmk && texMissing.length) {
  process.stderr.write(`컴파일 테스트를 건너뜁니다: 이 컴퓨터의 TeX에 서식이 쓰는 것이 없습니다 (${texMissing.join(', ')}). 앱에서도 그 서식은 컴파일되지 않습니다. TinyTeX면 tlmgr install로 깝니다.\n`)
}
export const R = '/api/researches/sample-research'

// 파일마다 useSampleApp()이 채운다 (vitest는 테스트 파일마다 모듈을 따로 읽는다)
export let tmp: string
export let repo: string
export let app: ReturnType<typeof buildApp>

/**
 * 이 뒤에 만드는 파일 감시(chokidar)를 모두 기억하고, 그것들이 처음 훑기를 마칠(ready) 때까지 기다리는 함수를 돌려준다.
 * 고정 시간(setTimeout) 대신 쓴다. vi.restoreAllMocks() 뒤에는 새 감시를 기억하지 않으니 다시 부른다.
 */
export function trackWatchers(): () => Promise<void> {
  const watch = chokidar.watch
  const ready: Promise<unknown>[] = []
  vi.spyOn(chokidar, 'watch').mockImplementation((...args: Parameters<typeof watch>) => {
    const w = watch(...args)
    ready.push(new Promise<void>((r) => w.once('ready', () => r())))
    return w
  })
  return async () => {
    expect(ready.length, '기다릴 파일 감시가 없음').toBeGreaterThan(0)
    await Promise.all(ready)
  }
}

/** 실제 연구 저장소처럼 .git 폴더가 있는 예제 연구 */
export function makeRepo(name: string, withWorkbench = true): string {
  const dir = path.join(tmp, name)
  if (withWorkbench) fs.cpSync(fixture, dir, { recursive: true, filter: (src) => !src.includes('.build') })
  else fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  return dir
}

/** 이 파일의 테스트 앞뒤로 임시 폴더를 만들고, 예제 연구를 등록한 앱을 띄운다 */
export function useSampleApp(): void {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-test-'))
    repo = makeRepo('sample-research')
    app = buildApp({ configDir: path.join(tmp, 'config') })
    const res = await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
    expect(res.statusCode).toBe(200)
    // 실사용은 처음에 저자가 없다(registry.ts). 예제 모드처럼 예시 저자를 넣어 둔다
    expect((await app.inject({ method: 'PUT', url: '/api/authors', payload: { authors: DEFAULT_AUTHORS } })).statusCode).toBe(200)
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
}

type Injector = { inject: ReturnType<typeof buildApp>['inject'] }
/** 고치는 API에 보낼 지금 해시 (화면이 읽을 때 받는 값과 같다). 없는 대상이면 맞지 않는 값 */
export const topicsHash = async (a: Injector = app, rid = R): Promise<string> => (await a.inject({ method: 'GET', url: `${rid}/topics` })).json().hash
export const noteHash = async (file: string, a: Injector = app, rid = R): Promise<string> =>
  ((await a.inject({ method: 'GET', url: `${rid}/notes` })).json().notes as { file: string; hash: string }[]).find((n) => n.file === file)?.hash ?? 'none'
