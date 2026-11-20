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
      'git add -A && git commit -m "고침"', 'git branch fix-x', 'git branch -d old', 'git push -u origin fix-x', 'git push origin HEAD:fix-x', 'git push origin v1 fix-x', 'git push --dry-run',
      'git fetch origin main', 'gh pr create --title t --body b', 'gh pr merge 449 --squash', 'gh pr merge 12 -s --match-head-commit abc',
      'git tag v1', 'git log --oneline | head -5', 'git -C /x commit -m x',
    ]) expect(stateOnlyCommand(c, w), c).toBe('ok')
  })
  it('되돌리기 어렵거나 체크아웃 파일을 바꾸는 것은 막는다', () => {
    for (const c of [
      // main에 바로 올리기 · 받는 가지를 적지 않은 푸시 · PR 코멘트는 묻는다 (11/20)
      'git push', 'git push origin', 'git push origin HEAD', 'git push origin main', 'git push -u origin HEAD:main', 'git push origin fix:refs/heads/main',
      'git push origin master', 'git push origin fix main', 'git push origin "refs/heads/*"', 'gh pr comment 3 --body ok',
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

describe('반복문 · python 읽기 · find -exec (11/20 "중앙 읽기 명령은 묻지 않고")', () => {
  const w = { gitWrites: true }
  it('상태만 보는 반복문 · python -I -c 읽기 · find -exec 읽기는 묻지 않는다', () => {
    for (const c of [
      'cd ~/x; for d in *; do echo "== $d"; ls "$d" | grep jsonl | wc -l; done; ls -la ~/y 2>/dev/null | head',
      'for d in ./*; do echo "== $d"; ls -- "$d" | grep -c jsonl; done',
      'for f in a.json b.json\ndo\n  wc -c "$f"\ndone',
      'for f in *.json; do echo "== $f $(wc -c <$f)"; python3 -I -c "import json,sys;d=json.load(open(sys.argv[1]));print(len(d))" "$f" | cut -c1-600; done',
      'find ~/x -name "*.jsonl" -exec ls -la {} \\;', 'find . -name "*.ts" -exec grep -l judge {} +',
      `python3 -I -c "import json, os.path; print(os.path.getsize('a'))"`, `python3 -I -c "from pathlib import Path; print(Path('a').read_text()[:100])"`,
      `python3 -I -c "with open('a', 'r', encoding='utf-8') as f: print(f.read().replace('x', 'y'))"`, 'python3 -I -m json.tool a.json', `python3 -I -c "import re,glob; print([f for f in glob.glob('*') if re.compile('a').search(f)])"`, 'python3 --version',
      'git log --oneline $(git merge-base origin/main HEAD)..HEAD', 'git diff --stat',
    ]) expect(stateOnlyCommand(c, w), c).toBe('ok')
  })
  it('반복 변수가 옵션이 되거나 python이 쓰고 돌릴 수 있으면 막는다', () => {
    for (const c of [
      'for x in -delete; do find . $x; done', 'for x in $(echo -delete); do find . $x; done', 'for x in a; do rm $x; done', 'for x in a; do ls; done > f',
      'find . -exec rm {} \\;', 'find . -exec sh -c ls \\;', 'find . -execdir ./x {} \\;', 'find . -exec ls {}', 'find . $(echo -delete)', 'find . -ok ls {} \\;',
      'git diff $(echo --output=x)', 'git diff --outp=x', 'git diff --ext', 'sort --out=x a', 'git ls-remote --upload=sh x', 'file --comp',
      `python3 -c "print(1)"`, `python3 -I -c "import subprocess; subprocess.run('ls')"`, `python3 -I -c "import os; os.system('ls')"`,
      `python3 -I -c "import os; os.remove('a')"`, `python3 -I -c "import os as o; o.replace('a','b')"`, `python3 -I -c "import os; p=os; p.replace('a','b')"`,
      `python3 -I -c "open('a','w').write('x')"`, `python3 -I -c "open('a', mode='a')"`, `python3 -I -c "o=open; o('a','w')"`, `python3 -I -c "m='w'; open('a', m)"`,
      `python3 -I -c "from pathlib import Path; Path('a').write_text('x')"`, `python3 -I -c "from pathlib import Path; Path('a').replace('b')"`,
      `python3 -I -c "print(().__class__)"`, `python3 -I -c "eval('1')"`, `python3 -I -c "import os; print(os.environ)"`, `python3 -I -c "print(open('$f').read())"`,
      `python3 -I -c "from os import *"`, `python3 -I -c "from os import remove"`, `python3 -I -c "import sys; sys.modules['os']"`, 'python3 -I -m json.tool a b', 'python3 -m json.tool a',
      'python3 x.py', `python3 -I -c "import os; os.path.os.remove('a')"`, `python3 -I -c "import glob; glob.os.remove('a')"`,
      `python3 -I -c "import collections; collections._sys.modules"`, `python3 -I -c "import operator"`, `python3 -I -c "from pathlib import Path; Path('a').copy('b')"`, 'python3 -I -c "print(\'\\x5f\')"',
    ]) expect(stateOnlyCommand(c, w), c).toBe('no')
  })
})

describe('셸이 낱말을 펼쳐 판정을 비켜 가는 길 (11/21 보안 검토)', () => {
  const no = (c: string) => expect(stateOnlyCommand(c), c).toBe('no')
  const ok = (c: string) => expect(stateOnlyCommand(c), c).toBe('ok')
  it('변수 · 중괄호가 옵션으로 펼쳐지는 꼴은 묻는다', () => {
    for (const c of [
      'find .$IFS-delete', 'find . -{delete,print}', 'sort a$IFS-o${IFS}b', 'git log -1$IFS--output=/tmp/x',
      'for f in ". -delete"; do find $f; done', 'for f in delete; do find . -$f; done', 'for f in "a b"; do uniq $f; done',
      'for f in {-delete,x}; do find . $f; done', 'for f in kern.maxfiles=1; do sysctl $f; done', 'for f in eww; do ps $f; done',
      'printf -v f -- -delete; find . $f', 'for x in a; do echo ${x@P}; done', 'echo "${x@P}"', 'uniq a{,b}', 'uniq *.txt',
      'python3 -I -m json.tool *.json', 'find . -name x $1',
    ]) no(c)
  })
  it('값이 한 낱말로 정해진 변수와 정규식의 $ · { } 는 그대로 둔다', () => {
    for (const c of [
      'for d in a b; do git -C $d status; done', 'for f in a.json b.json; do python3 -I -m json.tool $f; done', 'for f in *.json; do cat "$f" | head -3; done',
      'for f in a b; do echo ${f%.json} ${f##*/}; done', 'git -C $HOME/x status', 'find $HOME/x -name a', 'rg "foo$|bar" src', 'rg "a{2,3}" src', 'find . -name "*.md" -exec cat {} +',
      'git grep -n "end$|fin"', 'find ${HOME}/x -type f',
    ]) ok(c)
  })
  it('하위 명령은 첫 낱말로 본다: 옵션의 값이 허용한 이름이어도 뒤의 명령을 돌리지 않는다', () => {
    for (const c of ['npm --loglevel info run build', 'pnpm --loglevel info run build', 'pnpm --filter list run build', 'yarn --cwd info run build', 'gh pr --repo view merge 5']) no(c)
    for (const c of ['pnpm -r list', 'npm ls -g', 'npm -g ls', 'pnpm --filter=web list', 'gh pr view 5 --json title', 'gh run list --limit 5', 'brew list']) ok(c)
  })
  it('git ls-remote --exec · date --set 은 묻는다', () => {
    for (const c of ['git ls-remote --exec=/bin/echo .', 'git ls-remote --exe=/bin/echo .', 'date --set=2020-01-01']) no(c)
    for (const c of ['git ls-remote --exit-code origin', 'date +%F']) ok(c)
  })
  it('python: 쓰기로 여는 숨은 꼴은 묻는다', () => {
    const py = (code: string) => `python3 -I -c "${code}" f`
    for (const code of [
      `import sys; open(*[sys.argv[1],'w']).write('x')`, `from pathlib import Path; import sys; Path(sys.argv[1]).open('w')`, `from pathlib import Path; Path('a').open(mode='w')`,
      `import sys; open(sys.argv[1], mode='r' if 0 else 'w')`, `open('a(b', 'w')`, `ｅｖａｌ('1')`, `print(f'{open(1)}')`, `import sys; open(sys.argv[1], **{'mode': 'w'})`,
    ]) no(py(code))
    for (const code of [
      `import json,sys; print(len(json.load(open(sys.argv[1]))))`, `import sys; print(open(sys.argv[1], 'r', encoding='utf-8').read()[:200])`, `import sys; print(open(sys.argv[1], mode='rb').read(8))`,
      `from pathlib import Path; import sys; print(Path(sys.argv[1]).open().read()[:80])`, `from pathlib import Path; print(Path('a(b').open('r').read())`,
    ]) ok(py(code))
  })
  it('줄 잇기 · find -exec … + · 옵션 이름의 별표 · python의 다른 이름 꺼내기도 묻는다', () => {
    for (const c of [
      'find . -del\\\nete', 'find . -name "*.txt" -exec uniq {} +', 'find . -name "*.json" -exec python3 -I -m json.tool {} +', 'find . -delet?',
      `python3 -I -c "g=(x for x in [1]); g.gi_frame.f_builtins['ex'+'ec']('1')"`, `python3 -I -c "import pathlib; pathlib.attrgetter('o'+'s.remove')(pathlib)('x')"`,
      `python3 -I -c "import glob; glob.operator.attrgetter('o'+'s.remove')(glob)('x')"`,
    ]) no(c)
    for (const c of ['git log \\\n --oneline -3', 'rg --glob=*.ts foo', 'find . -name "*.txt" -exec uniq {} \\;', 'find . -name "*.md" -exec wc -l {} +', "echo 'a\\\nb'"]) ok(c)
  })

})
