import { describe, expect, it } from 'vitest'
import { inTemp, neverBypass } from './chat-bypass.js'

describe('중앙 대화의 우회: 허락해도 돌리지 않는 명령', () => {
  it('허락하면 돌릴 수 있는 명령', () => {
    for (const c of [
      'ps -axm -o pid,rss,command | head -20', 'ps -ax -o pid,command | grep -E "chrome.*headless"', 'memory_pressure', "awk '{print $1}' a.txt", 'sed -n 1,5p workbench/notes/a.md',
      'xargs -n 1 echo', 'FOO=1 ls', 'ls > /tmp/out.txt', 'pkill -f "Chrome.*--headless"', 'kill 1234', 'rm -rf /tmp/shots-123', 'rm -rf "$TMPDIR/x"',
      'rm -rf /private/var/folders/ab/cd/T/pw-1', 'rm a.txt', 'git push origin feature', 'git push -u origin claude/x', 'git branch -D old-branch', 'git reset --soft HEAD~1',
      'cat workbench/notes/a.md | wc -l', 'cp workbench/notes/a.md /tmp/a.md', 'python3 -c "print(open(\'workbench/a.md\').read())"', 'git log 2>&1 | head',
    ]) expect(neverBypass(c), c).toBeUndefined()
  })
  it('되돌리기 어려운 git', () => {
    for (const [c, why] of [
      ['git push --force origin main', 'force-push'], ['git push -f', 'force-push'], ['git push -uf origin x', 'force-push'], ['git push origin +main', 'force-push'],
      ['git push --force-with-lease', 'force-push'], ['git -C /x push --force', 'force-push'], ['git reset --hard origin/main', 'reset-hard'], ['git reset --hard', 'reset-hard'],
      ['git branch -D main', 'delete-main'], ['git branch -d --force master', 'delete-main'], ['git push origin :main', 'delete-main'], ['git push origin --delete main', 'delete-main'],
    ] as const) expect(neverBypass(c), c).toBe(why)
  })
  it('임시 폴더 밖 rm -rf', () => {
    for (const c of ['rm -rf /', 'rm -rf ~/x', 'rm -fr node_modules', 'rm -r -f build', 'rm --recursive --force x', 'rm -rf /tmp', 'rm -rf /tmp/../Users/x', 'rm -rf /tmp/a ~/b', 'rm -rf $(pwd)', 'rm -rf "$HOME"'])
      expect(neverBypass(c), c).toBe('rm-outside-temp')
  })
  it('workbench/ 쓰기', () => {
    for (const c of [
      'echo x > workbench/notes/a.md', 'echo x >> "workbench/records.yaml"', 'cat a | tee workbench/notes/a.md', 'sed -i "" s/a/b/ workbench/notes/a.md', 'perl -pi -e s/a/b/ workbench/x.md',
      'mv workbench/notes/a workbench/notes/b', 'rm workbench/notes/a.md', 'cp /tmp/a.md workbench/notes/a.md', 'touch /repo/workbench/x', 'git checkout -- workbench/notes',
      'git restore workbench/notes/a.md', 'python3 -c "open(\'workbench/a.md\',\'w\').write(1)"',
    ]) expect(neverBypass(c), c).toBe('workbench-write')
  })
  it('감싸기와 $( ) 안쪽도 본다', () => {
    for (const c of [
      'sh -c "git push --force"', "bash -lc 'rm -rf ~/x'", 'eval "git reset --hard"', 'echo $(git reset --hard)', 'ls; git push -f', 'true && rm -rf x', 'env A=1 git push -f',
      'sudo rm -rf /x', 'find . -name a | xargs -n 1 rm -rf', 'nohup git push --force &', 'zsh -c "echo x > workbench/a.md"',
    ]) expect(neverBypass(c), c).toBeDefined()
  })
  it('임시 폴더', () => {
    expect(inTemp('/tmp/a')).toBe(true)
    expect(inTemp('/private/tmp/a/b')).toBe(true)
    expect(inTemp('/tmp')).toBe(false)
    expect(inTemp('/tmp/')).toBe(false)
    expect(inTemp('./tmp/a')).toBe(false)
    expect(inTemp('/var/folders/ab/cd/T')).toBe(false)
  })
})
