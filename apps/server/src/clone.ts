import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

const exec = promisify(execFile)

/**
 * GitHub 저장소 주소를 이 컴퓨터로 받아 와(git clone) 연구로 등록할 수 있게 한다.
 * 받는 데는 이 컴퓨터의 git 로그인(맥의 키체인 등)을 그대로 쓴다. 따로 계정을 연결하지 않는다.
 */
export interface GitHubRepo { owner: string; name: string; url: string }

/** https://github.com/owner/repo(.git), git@github.com:owner/repo(.git), owner/repo 를 받는다 */
export function parseGitHubRepo(input: string): GitHubRepo | null {
  const s = input.trim().replace(/\/+$/, '')
  const m = s.match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/)
  const [, owner, name] = m ?? []
  if (!owner || !name || name === '.' || name === '..') return null
  return { owner, name, url: `https://github.com/${owner}/${name}.git` }
}

/** 받을 곳의 기본값: 이미 등록한 연구들이 모여 있는 폴더, 없으면 ~/GitHub */
export function defaultCloneDir(registered: string[]): string {
  const parents = registered.map((p) => path.dirname(p))
  const counts = new Map<string, number>()
  for (const p of parents) counts.set(p, (counts.get(p) ?? 0) + 1)
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  return best ?? path.join(os.homedir(), 'GitHub')
}

/** source를 parent/name 으로 받는다. 이미 있으면 덮어쓰지 않고 거절한다 */
export async function cloneInto(source: string, parent: string, name: string): Promise<string> {
  if (!path.isAbsolute(parent)) throw new WorkbenchError(400, t('받을 폴더는 절대 경로여야 합니다.', 'The download folder must be an absolute path.'))
  const dest = path.join(parent, name)
  if (fs.existsSync(dest)) throw new WorkbenchError(409, t(`이미 있는 폴더입니다: ${dest}. 그 경로를 그대로 등록하세요.`, `This folder already exists: ${dest}. Register that path as it is.`))
  fs.mkdirSync(parent, { recursive: true })
  try {
    await exec('git', ['clone', '--quiet', '--', source, dest], { timeout: 300_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true })
    const msg = ((e as { stderr?: string }).stderr || (e as Error).message).trim().split('\n').pop()
    throw new WorkbenchError(502, t(`GitHub에서 받지 못했습니다: ${msg}. 비공개 저장소라면 이 컴퓨터의 git이 GitHub에 로그인되어 있어야 합니다.`, `Could not download from GitHub: ${msg}. For a private repository, git on this computer must be signed in to GitHub.`))
  }
  return dest
}
