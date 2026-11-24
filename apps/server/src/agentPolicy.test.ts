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
    // main에 바로 올리기와 PR 코멘트는 허락 카드로 (11/20)
    for (const c of ['git push origin HEAD:main', 'git push origin main', 'git push', 'gh pr comment 3 --body ok']) expect(bash(c).kind, c).toBe('ask')
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
  it('상태 보기로 꾸민 쓰기 · 실행은 묻지 않고 돌지 않는다: 우회로 묻거나 막는다 (11/20 보안 검토, 파일 쓰기는 11/24부터 막음)', () => {
    for (const c of [`echo 'x' \\" > ~/.zshenv \\"`, 'printf x | sort -o/w/app/.git/hooks/pre-commit', 'rg --hostname-bin ./x --hyperlink-format default a', 'git config --get a.b --global -e', 'git ls-remote -u ./x .']) expect(bash(c).kind, c).not.toBe('allow')
  })
  it('읽기 전용 프로젝트 대화: 읽기로 꾸민 명령을 묻지 않고 돌리지 않는다 (11/20 보안 검토)', () => {
    const p: PolicyCtx = { rid: 'p', write: 'read', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo: '/w/p', readable: [], claimedBy: () => undefined }
    // 감싸 돌리는 명령(sh -c)도 안의 삭제를 보고 막는다
    for (const c of ['ls & rm -rf notes', 'sort -o a.md b.md', "sed -n 'w a.md' b.md", "env sh -c 'rm -rf notes'"]) expect(judge(p, 'Bash', { command: c }).kind, c).toBe('deny')
    for (const c of ['awk \'BEGIN{"rm -rf notes" | getline}\'']) expect(judge(p, 'Bash', { command: c }).kind, c).toBe('ask')
    expect(judge(p, 'Bash', { command: 'ls workbench | sort | head' }).kind).toBe('allow')
  })
  it('임시 폴더 밖 파일 쓰기는 허락 카드 없이 막고 하위 대화로 보낸다 (11/24)', () => {
    for (const c of ["cat > apps/server/src/a.ts <<'EOF'\nconst f = (x) => x\nEOF", 'cat >> apps/a.ts <<EOF\nx\nEOF', "sed -i '' s/a/b/ src/a.ts", 'tee src/a.ts < x']) {
      const v = bash(c)
      expect(v.kind, c).toBe('deny')
      expect(v.kind === 'deny' && v.message, c).toContain('chat_open')
    }
    expect(bash("cat > /tmp/probe.txt <<'EOF'\nx\nEOF").kind).toBe('ask')
  })
  it('파일 고치기는 막고 하위 대화와 되는 명령을 알려 준다', () => {
    const v = judge(ctx, 'Write', { file_path: '/w/app/a.ts', content: 'x' })
    expect(v.kind === 'deny' && v.message).toContain('chat_open')
    expect(v.kind === 'deny' && v.message).toContain('git log/status/diff')
    expect(v.kind === 'deny' && v.message).toContain('--squash')
  })
})

// 자동 모드 (11/23 사용자 "클로드 자동 모드처럼"): 읽기 · 작업 폴더 안 명령 · 웹은 묻지 않고, 크리티컬한 일과 비밀이 든 곳만 한 번 묻는다
describe('자동 모드', () => {
  const app: PolicyCtx = { rid: '_app', write: 'notes', mode: 'auto', planOk: false, scope: { kind: 'app' }, repo: '/w/wt', readable: ['/w/main'], claimedBy: () => undefined }
  const run = (command: string, c = app) => judge(c, 'Bash', { command })
  it('작업 폴더의 명령 · 고치기 · 읽기는 묻지 않는다', () => {
    for (const c of ['pnpm install --frozen-lockfile --prefer-offline', 'pnpm type-check', 'pnpm test', 'git fetch origin main && git merge origin/main', 'git add -A && git commit -m x', 'grep -rn "restart" src', 'cat /etc/hosts', 'sed -i "" s/a/b/ src/a.ts', 'node scripts/x.mjs']) expect(run(c).kind, c).toBe('allow')
  })
  it('지우기 · 밖으로 보내기 · 앱 다시 시작 · 계정 · 비밀 · 폴더 밖 고치기는 「늘」 없이 한 번 묻는다', () => {
    for (const c of ['rm src/a.ts', 'curl https://example.com', 'gh auth status', 'brew services restart x', 'cat ~/.ssh/id_rsa', 'echo x > /w/main/a.txt', 'pnpm add left-pad']) {
      const v = run(c)
      expect(v.kind === 'ask' && v.once, c).toBe(true)
    }
  })
  it('읽기 도구는 어디든 읽되 비밀이 든 곳은 한 번 묻는다', () => {
    expect(judge(app, 'Read', { file_path: '/etc/hosts' }).kind).toBe('allow')
    for (const f of ['/Users/x/.ssh/config', '/Users/x/.config/research-workspace/personal/_settings/a.json', '/Users/x/.config/research-workspace/personal/_chats/c.json', '/w/wt/.env']) {
      const v = judge(app, 'Read', { file_path: f })
      expect(v.kind === 'ask' && v.once, f).toBe(true)
    }
  })
  it('웹 검색과 PR 올리기 · 합치기는 묻지 않는다', () => {
    expect(judge(app, 'WebSearch', { query: 'Claude vision image token cost' }).kind).toBe('allow')
    expect(judge(app, 'mcp__workbench__app_submit', { title: 'x' }).kind).toBe('allow')
    expect(judge(app, 'mcp__workbench__app_merge', {}).kind).toBe('allow')
  })
  it('편집 자동 허용은 그대로: 웹은 묻고, 계획 승인 전과 읽기 전용은 자동이어도 막는다', () => {
    expect(judge({ ...app, mode: 'edit' }, 'WebSearch', { query: 'x' }).kind).toBe('ask')
    expect(run('pnpm test', { ...app, write: 'read' }).kind).toBe('deny')
  })
})
