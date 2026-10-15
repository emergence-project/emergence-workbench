import fs from 'node:fs'
import path from 'node:path'
import { git, GIT_TIMEOUT } from './git.js'

/** Read-only commands shared by the home API (gitsync.ts) and the agent summary (localSyncState). */
export const syncCommands = {
  top: ['rev-parse', '--show-toplevel'],
  branch: ['rev-parse', '--abbrev-ref', 'HEAD'],
  upstream: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
  counts: ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
  status: ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
  // Disable rename detection so both the old and new paths are checked.
  incoming: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '@{upstream}'],
  added: ['diff', '--name-only', '--no-renames', '--diff-filter=A', '-z', 'HEAD', '@{upstream}'],
  untracked: ['ls-files', '--others', '--exclude-standard', '-z'],
} satisfies Record<string, string[]>

const paths = (raw: string) => raw.split('\0').filter(Boolean)

/** -z porcelain has an extra source path for renames/copies, not another dirty entry. */
export function workingChanges(raw: string): { dirty: number; paths: Set<string> } {
  const entries = paths(raw)
  const changed = new Set<string>()
  let dirty = 0
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    dirty++
    changed.add(entry.slice(3))
    if (/[RC]/.test(entry.slice(0, 2))) changed.add(entries[++i]!)
  }
  return { dirty, paths: changed }
}

export function syncChanges(status: string, incoming = '', added = '', untracked = '') {
  const local = workingChanges(status)
  const remotePaths = new Set(paths(incoming))
  const addedPaths = new Set(paths(added))
  const conflicts = [...new Set([
    ...[...local.paths].filter((p) => remotePaths.has(p)),
    ...paths(untracked).filter((p) => addedPaths.has(p)),
  ])].sort()
  return { dirty: local.dirty, conflicts: conflicts.slice(0, 20), conflictCount: conflicts.length }
}

export interface LocalSyncState { ahead: number; behind: number; conflicts: string[]; conflictCount: number; fetchedAt: Date | null }

/**
 * 지난 결과와 그때 본 git 파일들의 시각. 결과는 HEAD · 브랜치 · 받아 둔 원격 ref · FETCH_HEAD · 설정으로만 정해질 때
 * (뒤처지지 않을 때)만 둔다. 뒤처지면 겹치는 파일이 작업 폴더 변경에 따라 달라지므로 매번 다시 잰다.
 */
const cache = new Map<string, { files: string[]; stamp: string; state: LocalSyncState }>()
const stampOf = (files: string[]) => files.map((f) => { try { return String(fs.statSync(f).mtimeMs) } catch { return '-' } }).join(',')

/** No fetch: consult the last received refs. Not a repository root or any git failure -> skip. */
export async function localSyncState(root: string): Promise<LocalSyncState | null> {
  const hit = cache.get(root)
  if (hit && stampOf(hit.files) === hit.stamp) return hit.state
  const run = (args: string[]) => git(root, args, { timeout: GIT_TIMEOUT.read, maxBuffer: 16 * 1024 * 1024 })
  try {
    const [top, gitDir, common, fetchHead] = (await run(['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir', '--git-path', 'FETCH_HEAD'])).split('\n')
    if (!top || !gitDir || !common || !fetchHead || fs.realpathSync.native(top) !== fs.realpathSync.native(root)) return null
    const branch = await run(['rev-parse', '--symbolic-full-name', 'HEAD'])
    const upstream = await run(['rev-parse', '--symbolic-full-name', '@{upstream}'])
    // 시각을 재기 전에 파일 목록을 정해 둔다: git이 도는 사이에 바뀌면 다음에 다시 잰다. ref는 낱 파일 · packed-refs · reftable 어디에 있어도 잡는다
    const files = [path.join(gitDir, 'HEAD'), fetchHead, path.join(common, 'config'), path.join(common, 'packed-refs'), path.join(common, 'reftable', 'tables.list'),
      path.join(common, ...branch.split('/')), path.join(common, ...upstream.split('/'))]
    const stamp = stampOf(files)
    const [ahead, behind] = (await run(syncCommands.counts)).split(/\s+/).map(Number) as [number, number]
    let state: LocalSyncState
    if (!ahead && !behind) state = { ahead, behind, conflicts: [], conflictCount: 0, fetchedAt: null }
    else {
      const changes = behind > 0
        ? syncChanges(await run(syncCommands.status), await run(syncCommands.incoming), await run(syncCommands.added), await run(syncCommands.untracked))
        : syncChanges('')
      let fetchedAt: Date | null = null
      try { fetchedAt = fs.statSync(fetchHead).mtime } catch { /* no FETCH_HEAD yet */ }
      state = { ahead, behind, ...changes, fetchedAt }
    }
    if (behind > 0) cache.delete(root)
    else cache.set(root, { files, stamp, state })
    return state
  } catch { return null }
}
