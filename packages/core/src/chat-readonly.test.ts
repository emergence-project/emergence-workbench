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
