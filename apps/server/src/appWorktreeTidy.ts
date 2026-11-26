/**
 * 끝난 앱 고치기 대화의 작업 폴더 치우기 (2026-11-25 사용자 결정 "작업 폴더 치우기"): 작업 폴더는 대화를 지울 때만 치워서,
 * PR을 합치거나 대화를 보관한 뒤에도 폴더(대부분 node_modules)와 브랜치가 쌓였다.
 * - 치워도 되는지는 대화의 표시(합쳐짐 · 보관)가 아니라 작업 폴더의 git에서 본다: 올리지 않은 고침이 없고(clean),
 *   커밋이 모두 main이나 끝난 PR에 있다(pushed). 같은 브랜치로 PR을 다시 연 대화는 "합쳐짐"이어도 남는다.
 * - 시안(mockups/, git에 없다)은 치우기 전에 앱 설정 폴더로 옮겨 대화 화면이 계속 보여 주고, 작업 폴더를 다시 만들면 되돌려 놓는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { git, GIT_TIMEOUT } from './git.js'

/** gh를 정해 둔 인자로 부르는 것 (appWorktree.ts의 gh, 시험은 정해 둔 답) */
export type Gh = (dir: string, args: string[]) => Promise<string>

/** 치운 작업 폴더의 시안을 남겨 두는 곳: 작업 폴더(<설정 폴더>/agent-worktrees/<대화>) 옆의 <설정 폴더>/agent-mockups/<대화> */
export const keptMockups = (dir: string): string => path.join(path.dirname(path.dirname(dir)), 'agent-mockups', path.basename(dir))

/** 폴더를 옮겨 적는다 (링크는 따라가지 않고 뺀다: 시안 폴더 밖 파일이 딸려 오지 않게). 같은 이름은 새것으로 */
function moveInto(from: string, to: string): void {
  if (!fs.existsSync(from) || !fs.lstatSync(from).isDirectory()) return
  fs.mkdirSync(to, { recursive: true })
  fs.cpSync(from, to, { recursive: true, force: true, filter: (f) => !fs.lstatSync(f).isSymbolicLink() })
  fs.rmSync(from, { recursive: true, force: true })
}

/** 작업 폴더를 치우기 전에: mockups/를 남겨 두는 곳으로 옮긴다 */
export const keepMockups = (dir: string): void => moveInto(path.join(dir, 'mockups'), keptMockups(dir))
/** 작업 폴더를 다시 만든 뒤: 남겨 둔 시안을 mockups/로 되돌린다 (에이전트가 앞 시안을 이어 고치게) */
export const restoreMockups = (dir: string): void => moveInto(keptMockups(dir), path.join(dir, 'mockups'))

/** 올리지 않은 고침이 없는가: 고친 파일 · 새 파일 (무시하는 파일과, 따로 남기는 mockups/는 빼고) */
export async function clean(dir: string): Promise<boolean> {
  return (await git(dir, ['status', '--porcelain', '--', '.', ':(exclude)mockups'], { env: { GIT_OPTIONAL_LOCKS: '0' } })) === ''
}

/** gh pr list --state all --json number,state,headRefOid */
const Prs = z.array(z.object({ number: z.number(), state: z.string(), headRefOid: z.string() }))

/**
 * 작업 폴더의 커밋이 모두 다른 곳에 있는가 (치워도 잃는 커밋이 없다):
 * 그 대화의 브랜치에 있고, main에 없는 커밋이 없거나, 폴더의 끝 커밋이 끝난(합쳐진 · 닫힌) PR에 들어 있다.
 * 열린 PR이 있으면 아니다 (CI · 합치기가 남았다). squash로 합치면 커밋이 main의 조상이 아니라서 PR의 끝 커밋과 견준다
 */
export async function pushed(root: string, dir: string, branch: string, gh: Gh): Promise<boolean> {
  if ((await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: GIT_TIMEOUT.read })) !== branch) return false
  if ((await git(dir, ['rev-list', '--count', 'origin/main..HEAD'])) === '0') return true
  const head = await git(dir, ['rev-parse', 'HEAD'], { timeout: GIT_TIMEOUT.read })
  const prs = Prs.parse(JSON.parse(await gh(root, ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,headRefOid'])))
  if (prs.some((p) => p.state === 'OPEN')) return false
  for (const p of prs) {
    if (p.headRefOid === head) return true
    // GitHub에서 main을 받아 PR의 끝이 더 나아갔으면: 폴더의 끝 커밋이 그 안에 있는지
    const inside = await git(root, ['fetch', 'origin', `refs/pull/${p.number}/head`])
      .then(() => git(root, ['merge-base', '--is-ancestor', head, p.headRefOid])).then(() => true, () => false)
    if (inside) return true
  }
  return false
}
