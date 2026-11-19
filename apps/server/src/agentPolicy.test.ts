// 중앙 대화의 명령 (11/18 "중앙은 읽기 명령을 직접"): 상태만 보는 명령은 묻지 않고, 비밀이 든 곳은 한 번 묻고, git · gh 쓰기(11/19)도 묻지 않고,
// 나머지 명령은 명령 · 까닭 · 폴더를 보이며 사용자에게 묻고(11/20 우회), 허락해도 안 되는 것과 파일 고치기는 막는다
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
  it('목록에 없는 명령은 막지 않고 명령 · 까닭 · 폴더를 보이며 묻는다 (11/20 우회)', () => {
    for (const c of ['memory_pressure | xargs echo', "awk '{print $1}' a", 'pkill -f "Chrome.*--headless"', 'npm i', 'git checkout main', 'rm -rf /tmp/shots-1']) {
      const v = bash(c)
      expect(v.kind, c).toBe('ask')
      // 「늘」은 이 대화에서 바로 그 명령만 (once 아님, 열쇠가 명령 그대로)
      expect(v.kind === 'ask' && [v.bypass, v.key, v.once], c).toEqual([c, `bypass:${c}`, undefined])
    }
    const v = judge(ctx, 'Bash', { command: 'pkill -f headless', description: '남은 헤드리스 Chrome 끄기' })
    expect(v.kind === 'ask' && v.summary).toBe('pkill -f headless\n까닭: 남은 헤드리스 Chrome 끄기\n폴더: /w/app')
  })
  it('허락해도 안 되는 명령은 묻지 않고 막는다', () => {
    for (const c of ['git push --force', 'git reset --hard', 'git branch -D main', 'rm -rf ~/x', 'echo x > workbench/notes/a.md', 'sh -c "git push -f"']) {
      const v = bash(c)
      expect(v.kind, c).toBe('deny')
      expect(v.kind === 'deny' && v.message, c).toContain('even with the user')
    }
  })
  it('파일 고치기는 막고 하위 대화와 되는 명령을 알려 준다', () => {
    const v = judge(ctx, 'Write', { file_path: '/w/app/a.ts', content: 'x' })
    expect(v.kind === 'deny' && v.message).toContain('chat_open')
    expect(v.kind === 'deny' && v.message).toContain('git log/status/diff')
    expect(v.kind === 'deny' && v.message).toContain('--squash')
  })
})
