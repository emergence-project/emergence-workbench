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
