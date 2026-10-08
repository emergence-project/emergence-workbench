// 서버 테스트가 함께 쓰는 것: 예제 연구, 임시 폴더, 예제 연구를 등록한 앱
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect } from 'vitest'
import { buildApp } from './app.js'

export const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/sample-research')
export const hasLatex = (() => { try { execFileSync('latexmk', ['-v']); return true } catch { return false } })()
export const R = '/api/researches/sample-research'

// 파일마다 useSampleApp()이 채운다 (vitest는 테스트 파일마다 모듈을 따로 읽는다)
export let tmp: string
export let repo: string
export let app: ReturnType<typeof buildApp>

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
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
}

export const block = (id: string) => fs.readFileSync(path.join(repo, 'workbench/blocks', `${id}.tex`), 'utf8')

type Injector = { inject: ReturnType<typeof buildApp>['inject'] }
/** 고치는 API에 보낼 지금 해시 (화면이 읽을 때 받는 값과 같다). 없는 대상이면 맞지 않는 값 */
export const topicsHash = async (a: Injector = app, rid = R): Promise<string> => (await a.inject({ method: 'GET', url: `${rid}/topics` })).json().hash
export const blockHash = async (id: string, a: Injector = app, rid = R): Promise<string> => (await a.inject({ method: 'GET', url: `${rid}/blocks/${id}` })).json().hash ?? 'none'
export const noteHash = async (file: string, a: Injector = app, rid = R): Promise<string> =>
  ((await a.inject({ method: 'GET', url: `${rid}/notes` })).json().notes as { file: string; hash: string }[]).find((n) => n.file === file)?.hash ?? 'none'
