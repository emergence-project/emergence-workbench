import { describe, expect, it } from 'vitest'
import { inTemp, neverBypass, writesFiles } from './chat-bypass.js'

describe('중앙 대화의 우회: 허락해도 돌리지 않는 명령', () => {
  it('허락하면 돌릴 수 있는 명령', () => {
    for (const c of [
      'ps -axm -o pid,rss,command | head -20', 'ps -ax -o pid,command | grep -E "chrome.*headless"', 'memory_pressure', "awk '{print $1}' a.txt", 'sed -n 1,5p workbench/notes/a.md',
      'xargs -n 1 echo', 'FOO=1 ls', 'ls > /tmp/out.txt', 'pkill -f "Chrome.*--headless"', 'kill 1234', 'rm -rf /tmp/shots-123', 'rm -rf "$TMPDIR/x"',
      'rm -rf /private/var/folders/ab/cd/T/pw-1', 'rm a.txt', 'git push origin feature', 'git push -u origin claude/x', 'git branch -D old-branch', 'git reset --soft HEAD~1',
      'cat workbench/notes/a.md | wc -l', 'cp workbench/notes/a.md /tmp/a.md', 'python3 -c "print(open(\'workbench/a.md\').read())"', 'git log 2>&1 | head',
    ]) expect(neverBypass(c), c).toBeUndefined()
  })
  // 11/25 검토 "분류기가 놓치는 것": 묶음 · find · xargs · $'…' 로 감싼 꼴
  it('묶음 ( … ) · { …; } · find -exec · xargs -I {} · $\'…\' 로 감싸도 같다', () => {
    for (const [c, why] of [
      ['(git push --force)', 'force-push'], ['{ git reset --hard; }', 'reset-hard'], ["sh -c '(git push --force)'", 'force-push'], ["git push $'--force'", 'force-push'],
      ['if true; then git reset --hard; fi', 'reset-hard'], ['find . -maxdepth 0 -exec git reset --hard \;', 'reset-hard'],
      ['ls | xargs -I {} rm -rf {}', 'rm-outside-temp'], ['find . -exec rm -rf {} +', 'rm-outside-temp'], ['find . -name node_modules -delete', 'rm-outside-temp'],
      ["sh -c 'echo $(rm -rf ~/x)'", 'rm-outside-temp'], ["echo $'a\\'' ; rm -rf ~/x ; echo '", 'rm-outside-temp'], ['(cd x && rm -rf ~/a)', 'rm-outside-temp'],
      ['find workbench -name "*.md" -delete', 'workbench-write'], ['find workbench/notes -exec rm {} \;', 'workbench-write'], ['{ echo x > workbench/a.md; }', 'workbench-write'],
      ['git push origin :heads/main', 'delete-main'], ['git push origin --delete heads/main', 'delete-main'],
    ] as const) expect(neverBypass(c), c).toBe(why)
    // 임시 폴더만 뒤지는 find, 따옴표 안의 > 는 그대로 된다
    for (const c of ['find /tmp/shots-1 -name "*.png" -delete', 'find /tmp/x -exec rm -rf {} +', '(cd /tmp/a && ls)', 'find . -exec wc -l {} +', 'grep "a > workbench/b" notes.txt'])
      expect(neverBypass(c), c).toBeUndefined()
  })
  // 11/25 별도 검토: 앞말에 옵션 · 경로가 붙은 꼴과 따옴표의 끝
  it('앞말에 옵션이 붙거나 경로로 적어도, 주석 · 줄 잇기로 가려도 같다', () => {
    for (const [c, why] of [
      ['command -p git push --force', 'force-push'], ['command -- git push --force', 'force-push'], ['nohup -- git push --force', 'force-push'], ['exec -c git push --force', 'force-push'],
      ['/usr/bin/nohup git push --force', 'force-push'], ['nice -10 git reset --hard', 'reset-hard'], ['nice -n5 git reset --hard', 'reset-hard'], ['/usr/bin/time rm -rf x', 'rm-outside-temp'],
      ["echo $'\\c' ; rm -rf ~/x ; echo 'a'", 'rm-outside-temp'], ["git status # '\ngit push --force origin main # '", 'force-push'], ['git push --for\\\nce origin main', 'force-push'],
      [`echo $(echo ")" ; git push --force) '"'`, 'force-push'], ['echo $( (git push --force) )', 'force-push'], [`${'echo $(true) ; '.repeat(21)}echo $(git push --force)`, 'force-push'],
      [`awk 'BEGIN{print "x" > "workbench/a.md"}'`, 'workbench-write'], [`perl -e 'open(F, ">workbench/a.md")'`, 'workbench-write'],
    ] as const) expect(neverBypass(c), c).toBe(why)
  })
  // 11/25 별도 검토의 나머지
  it('zsh의 앞말 · 묶음, 옵션 줄임꼴, 펼침으로 만든 옵션도 같다', () => {
    for (const [c, why] of [
      ['noglob git push --force', 'force-push'], ['=git push --force', 'force-push'], ['repeat 1 git push --force', 'force-push'], ['case x in x) git push --force;; esac', 'force-push'],
      ['() { git push --force }', 'force-push'], ["ksh -c 'git push --force'", 'force-push'], ["bash -c -- 'git push --force'", 'force-push'], ["sh -ce 'git reset --hard'", 'reset-hard'],
      ['eval eval eval eval eval eval git push --force', 'force-push'], ['git --git-dir .git push --force', 'force-push'], ['git --work-tree . reset --hard', 'reset-hard'],
      ['git reset --har', 'reset-hard'], ['git push --mirr origin', 'force-push'], ['git push --forc', 'force-push'], ['git push --force-with-l origin x', 'force-push'], ['git push origin --del main', 'delete-main'],
      ['f=--force; git push origin main $f', 'force-push'], ['for o in --force; do git push origin x $o; done', 'force-push'], ['git push {--force,origin,main}', 'force-push'], ['git push --for${u}ce', 'force-push'],
      ['git update-ref -d refs/heads/main', 'delete-main'], ['git -C workbench checkout -- .', 'workbench-write'], ['git -C ../x/workbench clean -fd', 'workbench-write'],
      ['rm -rf /tmp/a/{.,}./{.,}./Users/u/Documents', 'rm-outside-temp'], ['rm -rf $TMPDIRx/Users/u/Documents', 'rm-outside-temp'], ['rm -rf {/tmp/a,~/b}', 'rm-outside-temp'],
    ] as const) expect(neverBypass(c), c).toBe(why)
    for (const c of ['git push --follow-tags origin x', 'git push --no-verify origin x', 'git reset --soft HEAD~1', 'git -C workbench status', 'rm -rf /tmp/a/{b,c}', 'rm -rf /tmp/shots-{1..3}', 'rm -rf $TMPDIR/x', 'git update-ref -d refs/heads/old',
      'noglob git push origin x', 'f=origin; git push $f x'])
      expect(neverBypass(c), c).toBeUndefined()
  })
  // 11/25 셋째 검토
  it('여러 뜻으로 읽힐 수 있으면 무거운 쪽으로, 펼침의 나머지', () => {
    for (const [c, why] of [
      [`echo "a $(echo "<<'true' ")"\necho \`git push --force origin main\`\ntrue`, 'force-push'], ["echo ${(e):-'$(git push --force)'}", 'force-push'],
      ['git push --forc{e..e} origin main', 'force-push'], ['git push --force{,}{,}{,}{,}{,} origin main', 'force-push'], ['git push $u--force origin main', 'force-push'],
      ['git push --for$()ce origin main', 'force-push'], ["bash -c -e 'git push --force'", 'force-push'], ['git --attr-source HEAD push --force origin main', 'force-push'],
      ['git --config-env a.b=HOME reset --hard', 'reset-hard'], ['for o in a b c d e f g h i j k l m n p q --force; do git push origin x $o; done', 'force-push'],
      ['rm -rf /tmp/a { /Users/u/Documents', 'rm-outside-temp'], ['rm -rf ${HOME:-/tmp/a/b}', 'rm-outside-temp'], ['find ${HOME:-/tmp/a} -delete', 'rm-outside-temp'],
      ['rm -rf /tmp/a/.$u./.$u./Users/u/Documents', 'rm-outside-temp'], [`rm -rf /tmp/a/${'{.,}'.repeat(12)}./x`, 'rm-outside-temp'], ['tee /tmp/x { workbench/a', 'workbench-write'],
    ] as const) expect(neverBypass(c), c).toBe(why)
    for (const c of ['rm -rf /tmp/a { /Users/u/Documents', 'tee /tmp/x { workbench/a']) expect(writesFiles(c), c).toBe(true)
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

describe('이음표와 겹친 치환 (11/20 보안 검토)', () => {
  it('& 뒤 · 겹친 $( ) 안의 명령도 본다', () => {
    expect(neverBypass('ls & git push --force')).toBe('force-push')
    expect(neverBypass('echo "$(echo $(git reset --hard))"')).toBe('reset-hard')
    expect(neverBypass('make 2>&1 | tail')).toBeUndefined()
  })
})

describe('writesFiles', () => {
  it('sees writes outside temp folders', () => {
    expect(writesFiles("cat > apps/server/src/a.ts <<'EOF'\nx\nEOF")).toBe(true)
    expect(writesFiles('echo hi >> notes.md')).toBe(true)
    expect(writesFiles('tee src/a.ts')).toBe(true)
    expect(writesFiles("sed -i '' 's/a/b/' src/a.ts")).toBe(true)
    expect(writesFiles('cp a.ts src/b.ts')).toBe(true)
    expect(writesFiles(`python3 -c "open('a','w').write('x')"`)).toBe(true)
  })
  // 11/25 검토: &> 파일, 묶음 · find · xargs 로 감싼 쓰기
  it('sees &> files and writes wrapped in groups, find and xargs', () => {
    for (const c of ['echo x &> src/a.log', 'pnpm test &>> out.log', '{ rm src/a.ts; }', '(touch src/a.ts)', 'find src -name "*.bak" -delete', 'find . -exec touch {} \;',
      'find . -fprint list.txt', 'ls | xargs rm', 'ls | xargs -I {} cp {} src/', "echo x > 'src/a.ts'"]) expect(writesFiles(c), c).toBe(true)
    for (const c of ['ls &> /dev/null', 'ls &>/tmp/out.txt', 'find /tmp/a -name "*.png" -delete', 'find . -exec wc -l {} +', 'ls | xargs wc -l', 'grep "=>" src/a.ts', '(cd src && ls)'])
      expect(writesFiles(c), c).toBe(false)
  })
  it('does not throw on thousands of nested quotes', () => {
    const deep = `${'echo "$('.repeat(5000)}ls${')"'.repeat(5000)}`
    expect(neverBypass(deep)).toBeUndefined()
    expect(writesFiles(deep)).toBe(false)
  })
  it('sees writes inside awk and perl code', () => {
    for (const c of [`awk 'BEGIN{print "x" > "app.ts"}'`, `awk '{print >> "out.txt"}' a`, `perl -e 'open(F, ">app.ts")'`]) expect(writesFiles(c), c).toBe(true)
    expect(writesFiles("awk '$1 > 3 {print $2}' a.txt")).toBe(false)
  })
  it('lets temp files, sinks and reads through', () => {
    expect(writesFiles("cat > /tmp/probe.txt <<'EOF'\nx\nEOF")).toBe(false)
    expect(writesFiles('pnpm test 2>&1 | tail -5')).toBe(false)
    expect(writesFiles('ls > /dev/null 2>&1')).toBe(false)
    expect(writesFiles('git log --oneline -5')).toBe(false)
    expect(writesFiles('mkdir -p /tmp/x && cp a /tmp/x/')).toBe(false)
    expect(writesFiles("cat > /tmp/p.ts <<'EOF'\nconst f = (x) => x > 1\nEOF\nls")).toBe(false)
  })
})
