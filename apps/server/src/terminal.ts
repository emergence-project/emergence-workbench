// 이 컴퓨터의 터미널 (오른쪽 사이드바 › 터미널). 사용자가 직접 치는 셸이라 에이전트 권한과 상관없다.
// node-pty는 플랫폼마다 미리 빌드한 부품(@lydell/node-pty-<플랫폼>-<arch>)을 쓴다. 없으면 터미널만 끄고 앱은 그대로 돈다
import fs from 'node:fs'
import os from 'node:os'
import type { IPty } from '@lydell/node-pty'

export type PtyModule = Pick<typeof import('@lydell/node-pty'), 'spawn'>

/** 오류의 글 */
export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

let loading: Promise<PtyModule | string> | undefined
/** node-pty를 처음 쓸 때 한 번 읽는다. 못 읽으면 그 까닭 */
export function loadPty(): Promise<PtyModule | string> {
  loading ??= import('@lydell/node-pty').then((m): PtyModule => ({ spawn: m.spawn }), messageOf)
  return loading
}

/** 사용자의 셸. 맥 · 리눅스는 로그인 셸(-l)로 열어 PATH 등 평소 설정을 읽는다 (Finder에서 연 앱은 PATH가 짧다) */
export function shellOf(env: NodeJS.ProcessEnv = process.env, platform = process.platform): { file: string; args: string[] } {
  if (platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] }
  return { file: env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/sh'), args: ['-l'] }
}

/** 셸에 넘기는 환경: 앱 서버의 것(RW_로 시작: 앱 열쇠 등)은 뺀다 */
export function shellEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !k.startsWith('RW_')) out[k] = v
  return { ...out, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
}

/** 시작 폴더: 있는 폴더면 그곳, 아니면 홈 */
export function startDir(dir: string | null): string {
  try { if (dir && fs.statSync(dir).isDirectory()) return dir } catch { /* 없는 폴더 */ }
  return os.homedir()
}

/** 셸 하나를 연다 */
export function openShell(pty: PtyModule, cwd: string, size: { cols: number; rows: number }): { proc: IPty; shell: string } {
  const sh = shellOf()
  return { proc: pty.spawn(sh.file, sh.args, { name: 'xterm-256color', cwd, cols: size.cols, rows: size.rows, env: shellEnv() }), shell: sh.file }
}
