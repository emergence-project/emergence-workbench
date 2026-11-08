// 서버가 git을 부르는 곳 하나 (2026-10-15 종합 검토 묶음 C). 모두 비동기라 git이 도는 동안에도 다른 요청을 받는다.
// 앱 화면이 쓰지 않는 CLI 검사(agentChanges.ts)와 테스트 도우미는 그대로 동기로 부른다.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** 시간 한도 한 표 */
export const GIT_TIMEOUT = {
  /** 받아 둔 ref만 보는 읽기: 홈 · STATUS의 앞섬 · 뒤처짐 */
  read: 5_000,
  /** 그 밖의 로컬 작업과 GitHub와 주고받기: 받기 · 올리기 · 앱 업데이트 */
  remote: 60_000,
  /** 개인 저장소 · 백업 사본 */
  backup: 120_000,
  /** 새로 받기(clone) */
  clone: 300_000,
} as const

const MB = 1024 * 1024

export interface GitOptions {
  timeout?: number
  /** 이 호출에만 더하는 환경 변수 */
  env?: Record<string, string>
  maxBuffer?: number
  /** 표준 입력으로 줄 글 (hash-object --stdin-paths 등) */
  input?: string
}

/**
 * git 전체 설정에 이름 · 이메일이 없을 때 커밋에 대신 적을 것 (내려받은 앱, 11/8 "GitHub를 모르는 친구").
 * 비어 있으면 git이 커밋을 거절해 기록 · 노트를 저장소에 남기지 못하므로, 사용자가 설정 › 계정에서 적기 전까지 이것을 쓴다.
 * git 설정 파일은 고치지 않고 이 서버가 부르는 git에만 환경 변수로 준다
 */
let fallbackIdentity: { name: string; email: string } | null = null
export function setFallbackIdentity(id: { name: string; email: string } | null): void { fallbackIdentity = id }
export function getFallbackIdentity(): { name: string; email: string } | null { return fallbackIdentity }
const identityEnv = (): Record<string, string> => fallbackIdentity
  ? { GIT_AUTHOR_NAME: fallbackIdentity.name, GIT_AUTHOR_EMAIL: fallbackIdentity.email, GIT_COMMITTER_NAME: fallbackIdentity.name, GIT_COMMITTER_EMAIL: fallbackIdentity.email }
  : {}

const run = (args: string[], o: GitOptions) => ({
  timeout: o.timeout ?? GIT_TIMEOUT.remote,
  maxBuffer: o.maxBuffer ?? 64 * MB,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...identityEnv(), ...o.env },
  args,
})

/** git args (작업 폴더 없이: clone · merge-file). 출력을 그대로 돌려준다. 실패하면 execFile의 오류(stderr 포함)를 그대로 던진다 */
export async function gitRun(args: string[], o: GitOptions = {}): Promise<string> {
  const r = run(args, o)
  if (o.input === undefined) return (await exec('git', r.args, { timeout: r.timeout, maxBuffer: r.maxBuffer, env: r.env })).stdout
  return new Promise<string>((resolve, reject) => {
    const p = execFile('git', r.args, { timeout: r.timeout, maxBuffer: r.maxBuffer, env: r.env }, (e, out) => (e ? reject(e) : resolve(out)))
    p.stdin!.end(o.input)
  })
}

/** git -C root args. 앞뒤 공백을 뗀 출력. -z 출력은 첫 항목 앞 공백(status의 ' M')도 뜻이 있어 그대로 */
export async function git(root: string, args: string[], o: GitOptions = {}): Promise<string> {
  const out = await gitRun(['-C', root, ...args], o)
  return args.includes('-z') ? out : out.trim()
}

/** git -C root args의 출력을 바이트 그대로 (파일 내용) */
export async function gitBuffer(root: string, args: string[], o: GitOptions = {}): Promise<Buffer> {
  const r = run(['-C', root, ...args], o)
  return (await exec('git', r.args, { timeout: r.timeout, maxBuffer: r.maxBuffer, env: r.env, encoding: 'buffer' })).stdout
}
