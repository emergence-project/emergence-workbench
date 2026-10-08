import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import YAML from 'yaml'
import { backupRemoteFor } from './backup.js'
import { withRepoLock } from './repoLock.js'

const exec = promisify(execFile)

/**
 * 사용자 개인 저장소 (2026-10-08 결정): 앱 저장소는 공개하고, 사용자마다 비공개 개인 저장소에
 * 앱 설정 · 맥에만 있는 workbench/ (backup.ts) · 앱 피드백(feedback/)을 둔다.
 * 피드백은 설정 폴더의 `personal/` 사본에 쌓고, 그 사본에서 feedback/만 올린다(pathsync.ts).
 */

const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
async function git(cwd: string, args: string[]): Promise<string> {
  return (await exec('git', ['-C', cwd, ...args], { timeout: 120_000, env })).stdout.trim()
}
async function originOf(dir: string): Promise<string | null> {
  try { return (await git(dir, ['remote', 'get-url', 'origin'])) || null } catch { return null }
}

/**
 * 개인 저장소 주소. 차례대로: RW_PERSONAL_REMOTE · RW_BACKUP_REMOTE, 설정(config.yaml)의 personalRepo,
 * 이미 받아 둔 백업 사본(설정 폴더 backup/)의 origin, 옛 앱 저장소(research-workspace) origin과 같은 계정의 research-workspace-backup.
 * 공개 저장소(emergence-workbench)를 받은 다른 사용자는 남의 저장소를 가리키지 않게 짐작하지 않는다: 설정하지 않으면 null(꺼짐).
 */
export async function personalRemote(configDir: string, appRoot: string): Promise<string | null> {
  const fromEnv = process.env.RW_PERSONAL_REMOTE || process.env.RW_BACKUP_REMOTE
  if (fromEnv) return fromEnv
  try {
    const doc = YAML.parse(fs.readFileSync(path.join(configDir, 'config.yaml'), 'utf8')) as { personalRepo?: unknown } | null
    if (typeof doc?.personalRepo === 'string' && doc.personalRepo.trim()) return doc.personalRepo.trim()
  } catch { /* 설정 파일이 없거나 읽지 못하면 다음 차례 */ }
  if (fs.existsSync(path.join(configDir, 'backup', '.git'))) {
    const o = await originOf(path.join(configDir, 'backup'))
    if (o) return o
  }
  const app = await originOf(appRoot)
  return app ? backupRemoteFor(app) : null
}

/**
 * 개인 저장소 사본을 준비한다. 이미 있으면 그대로 둔다.
 * 폴더에 파일이 있는데 git이 아니면(받지 못한 사이에 피드백을 남긴 경우) 그 파일을 잃지 않게
 * .git만 받아 붙이고, 이 폴더에 없는 GitHub 파일만 꺼낸다. 남긴 파일은 바뀐 것으로 남아 다음 올리기 때 올라간다.
 */
export async function ensurePersonalClone(dir: string, remote: string): Promise<void> {
  if (fs.existsSync(path.join(dir, '.git'))) return
  const hasFiles = fs.existsSync(dir) && fs.readdirSync(dir).length > 0
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  if (!hasFiles) {
    fs.rmSync(dir, { recursive: true, force: true })
    await exec('git', ['clone', '--quiet', remote, dir], { timeout: 300_000, env })
    return
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-personal-'))
  try {
    await exec('git', ['clone', '--quiet', '--no-checkout', remote, tmp], { timeout: 300_000, env })
    fs.renameSync(path.join(tmp, '.git'), path.join(dir, '.git'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  await git(dir, ['reset', '--quiet'])
  const missing = (await git(dir, ['ls-files', '--deleted'])).split('\n').filter(Boolean)
  if (missing.length) await git(dir, ['checkout', '--', ...missing])
}

/**
 * GitHub의 새 내용(에이전트가 적은 처리 기록 feedback/status.yaml 등)을 사본에 받는다.
 * 앞으로 감기만 되면 감고, 아니면 합친다. 합치다 부딪히면 그만두고(사본은 그대로) 오류를 돌려준다.
 */
export function pullPersonal(dir: string): Promise<{ ok: boolean; error?: string }> {
  return withRepoLock(dir, () => pullNow(dir))
}

async function pullNow(dir: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await git(dir, ['fetch', '--quiet', 'origin'])
    const upstream = await git(dir, ['rev-parse', '--verify', '--quiet', '@{upstream}']).catch(() => '')
    if (!upstream) return { ok: true }
    try {
      await git(dir, ['merge', '--ff-only', '--quiet', '@{upstream}'])
    } catch {
      try {
        await git(dir, ['-c', 'user.name=research-workspace', '-c', 'user.email=research-workspace@localhost', 'merge', '--no-edit', '--quiet', '@{upstream}'])
      } catch (e) {
        await git(dir, ['merge', '--abort']).catch(() => undefined)
        throw e
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as { stderr?: string }).stderr || (e as Error).message).split('\n')[0] }
  }
}
