import { describe, expect, it } from 'vitest'
import { stateOnlyCommand } from './chat-readonly.js'

describe('상태만 보는 명령 (중앙 대화)', () => {
  it('상태만 보는 명령은 이어도 묻지 않는다', () => {
    for (const c of [
      'ls ~/.gemini', 'npm ls -g', 'sysctl -n hw.memsize', 'git log --oneline | head -5', 'gh run view 123 --log', 'gh pr view 12 --json title',
      'which codex', 'memory_pressure', 'top -l 1 | head -20', 'vm_stat', 'ps aux | grep node', 'cd apps/server && grep -rn judge src',
      'git status 2>&1', 'ls /nope 2>/dev/null; echo done', 'git -C /x diff --stat', 'echo $(git rev-parse HEAD)', 'grep ">" a.txt', 'node --version',
      'find . -name "*.ts" | wc -l', '/bin/ls -la', 'git branch -a', 'date +%s',
    ]) expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('바꾸거나 다른 명령을 돌릴 수 있으면 막는다', () => {
    for (const c of [
      'npm i', 'npm install -g x', 'git commit -m x', 'git log && git push', 'ls > a.txt', 'echo x >> a', 'cat <<EOF', 'echo $(rm -rf x)', 'echo `touch a`',
      'find . -delete', 'find . -exec rm {} \\;', 'git diff --output=x', 'git -c core.pager=sh log', 'sysctl -w a=1', 'memory_pressure -l warn',
      'PAGER=sh git log', 'ls &', 'xargs rm', 'sh -c ls', 'awk 1 a', 'sed -n 1p a', './ls', 'gh pr merge 1', 'gh pr view 1 --web', 'sort -o a b',
      'git branch -D x', 'rm a', 'curl x', 'ps eww', 'env', 'cat <(ls)', 'diff <(ls) a', 'top',
    ]) expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('git -C · gh repo list · gh api GET 같은 읽기는 묻지 않는다 (중앙과 그가 띄운 보조 에이전트)', () => {
    for (const w of [{}, { gitWrites: true }]) for (const c of [
      'gh repo list emergence-project --json name,visibility', 'git -C ~/GitHub/research-library remote get-url origin; gh repo list emergence-project',
      'gh api repos/x/y/pulls', 'gh api repos/x/y/pulls --paginate --jq ".[].number"', 'gh api -X GET search/issues -f q=x', 'gh api --method=GET a -F per_page=100',
      'gh api graphql -f query="{ viewer { login } }"', 'gh pr checks 3', 'gh pr list --state open', 'gh pr diff 3', 'gh run list -L 5', 'gh repo view',
      'gh release list', 'gh workflow list', 'gh auth status', 'gh search prs x', 'git ls-remote origin', 'git worktree list', 'git rev-list --count HEAD',
    ]) expect(stateOnlyCommand(c, w), c).toBe('ok')
  })
  it('gh api 쓰기 · 비밀 보이기는 막는다', () => {
    for (const w of [{}, { gitWrites: true }]) for (const c of [
      'gh api -X POST repos/x/y/issues', 'gh api -XDELETE repos/x/y', 'gh api --method PATCH a', 'gh api repos/x/y/issues -f title=x', 'gh api a -F x=1',
      'gh api a --input f.json', 'gh api graphql -f query="mutation { x }"', 'gh api -X GET graphql -f query="mutation { x }"', 'gh auth status --show-token',
      'gh auth token', 'gh repo delete x', 'gh repo create x', 'gh release create v1', 'gh workflow run x', 'git ls-remote --upload-pack=sh x', 'git worktree add x',
      'git worktree remove x', 'git submodule update',
    ]) expect(stateOnlyCommand(c, w), c).toBe('no')
  })
  it('비밀이 든 곳을 보면 한 번 묻는다', () => {
    for (const c of ['cat ~/.ssh/id_ed25519', 'ls ~/.aws', 'cat .env', 'grep -r token ~/.config/gh']) expect(stateOnlyCommand(c), c).toBe('sensitive')
  })
})

describe('git · gh 쓰기 (중앙 대화)', () => {
  const w = { gitWrites: true }
  it('커밋 · 브랜치 · 푸시 · PR · squash 합치기는 묻지 않는다', () => {
    for (const c of [
      'git add -A && git commit -m "고침"', 'git branch fix-x', 'git branch -d old', 'git push -u origin fix-x', 'git push origin HEAD',
      'git fetch origin main', 'gh pr create --title t --body b', 'gh pr merge 449 --squash', 'gh pr merge 12 -s --match-head-commit abc',
      'gh pr comment 3 --body ok', 'git tag v1', 'git log --oneline | head -5', 'git -C /x commit -m x',
    ]) expect(stateOnlyCommand(c, w), c).toBe('ok')
  })
  it('되돌리기 어렵거나 체크아웃 파일을 바꾸는 것은 막는다', () => {
    for (const c of [
      'git push --force', 'git push -f origin x', 'git push --force-with-lease', 'git push origin +main', 'git push origin :old', 'git push --delete origin x',
      'git push --mirror', 'git branch -D x', 'git branch -f x', 'git reset --hard', 'git clean -fd', 'git checkout main', 'git switch -c x',
      'git merge origin/main', 'git rebase main', 'git pull', 'git stash', 'git restore a', 'git tag -d v1', 'git fetch --upload-pack=sh',
      'gh pr merge 1', 'gh pr merge 1 --merge', 'gh pr merge 1 --squash --admin', 'gh pr merge 1 --squash -d', 'gh pr create --web',
      'git commit -F - <<EOF', 'npm i', 'rm a', 'echo x > a',
    ]) expect(stateOnlyCommand(c, w), c).toBe('no')
  })
})

describe('판정을 빠져나가던 문법 (11/20 보안 검토)', () => {
  const w = { gitWrites: true }
  it('\\" 뒤에 숨긴 돌려보내기 · $\'…\' 는 막는다', () => {
    for (const c of [`echo 'x' \\" > /Users/a/.zshenv \\"`, `echo $'\\'' > /tmp/f $'\\''`, 'cat a\\ b > c', 'ls \; rm -rf x', 'echo "$(echo $(rm x))"']) expect(stateOnlyCommand(c, w), c).toBe('no')
  })
  it('\\로 지킨 글자는 그대로 읽는다', () => {
    for (const c of ['ls My\\ Notes', 'grep "a\\"b" f', 'find . -name \\*.ts', 'echo "$(git log -1 --format=%s $(git rev-parse HEAD))"']) expect(stateOnlyCommand(c, w), c).toBe('ok')
  })
  it('붙여 쓴 짧은 옵션으로 파일을 쓰거나 프로그램을 돌리는 것', () => {
    for (const c of [
      'sort -o/Users/a/.zshenv x', 'sort -uo out in', 'sort --output=out in', 'tree -oout', 'tree -R -L 2', 'rg --hostname-bin ./x --hyperlink-format default a',
      'file -C -m magic', 'git ls-remote -u ./x .', 'gh api graphql -F query=@m.graphql',
      'git config --get a.b --global -e', 'git config --list --file x', 'git config set a.b c', 'git config --get a.b --add c',
    ]) expect(stateOnlyCommand(c, w), c).toBe('no')
    for (const c of ['sort -n -k2 x', 'sort -u x | head', 'tree -L 2', 'file a.png', 'git config --get user.name', 'git config get user.name', 'git config --list', 'git ls-remote origin']) expect(stateOnlyCommand(c, w), c).toBe('ok')
  })
})
