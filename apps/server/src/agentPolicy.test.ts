// 중앙 대화의 명령 (11/18 "중앙은 읽기 명령을 직접"): 상태만 보는 명령은 묻지 않고, 비밀이 든 곳은 한 번 묻고, git · gh 쓰기(11/19)도 묻지 않고, 나머지는 하위 대화에 맡기라고 막는다
import { describe, expect, it } from 'vitest'
import { judge, type PolicyCtx } from './agentPolicy.js'

const ctx: PolicyCtx = { rid: '_central', write: 'read', mode: 'edit', planOk: false, scope: { kind: 'all' }, repo: '/w/app', readable: [], claimedBy: () => undefined }
const bash = (command: string) => judge(ctx, 'Bash', { command })

describe('중앙 대화의 명령', () => {
  it('상태만 보는 명령은 폴더 밖이라도 묻지 않는다 (보조 에이전트의 Bash도 같은 판정)', () => {
    for (const c of ['ls ~/.gemini', 'npm ls -g', 'sysctl -n hw.memsize', 'gh run view 1 --log']) expect(bash(c).kind, c).toBe('allow')
  })
  it('비밀이 든 곳은 「늘」 없이 한 번 묻는다', () => {
    const v = bash('cat ~/.ssh/config')
    expect(v.kind === 'ask' && v.once).toBe(true)
  })
  it('git · gh 커밋 · 푸시 · PR · squash 합치기는 묻지 않는다 (11/19)', () => {
    for (const c of ['git add -A && git commit -m x', 'git push -u origin fix', 'gh pr create --title t --body b', 'gh pr merge 3 --squash']) expect(bash(c).kind, c).toBe('allow')
  })
  it('바꾸는 명령은 막고 하위 대화와 되는 명령을 알려 준다', () => {
    for (const c of ['npm i', 'git push --force', 'git reset --hard', 'git checkout main', 'git pull']) expect(bash(c).kind, c).toBe('deny')
    const v = bash('rm a')
    expect(v.kind === 'deny' && v.message).toContain('chat_open')
    expect(v.kind === 'deny' && v.message).toContain('git log/status/diff')
    expect(v.kind === 'deny' && v.message).toContain('--squash')
  })
})
