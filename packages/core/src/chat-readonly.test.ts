import { describe, expect, it } from 'vitest'
import { stateOnlyCommand, touchesSecret } from './chat-readonly.js'

describe('상태만 보는 명령 (중앙 대화)', () => {
  it('상태만 보는 명령은 이어도 묻지 않는다', () => {
    for (const c of [
      'ls ~/.gemini', 'npm ls -g', 'sysctl -n hw.memsize', 'git log --oneline | head -5', 'gh run view 123 --log', 'gh pr view 12 --json title',
      'which codex', 'memory_pressure', 'top -l 1 | head -20', 'vm_stat', 'ps aux | grep node', 'cd apps/server && grep -rn judge src',
      'git status 2>&1', 'ls /nope 2>/dev/null; echo done', 'git -C /x diff --stat', 'echo $(git rev-parse HEAD)', 'grep ">" a.txt', 'node --version',
      'find . -name "*.ts" | wc -l', '/bin/ls -la', 'git branch -a', 'date +%s',
    ]) expect(stateOnlyCommand(c), c).toBe('ok')
  })
  // 11/25: 작은따옴표 안을 가린 채로 규칙에 넘겨 exec( · eval( 이 보이지 않았다 (#681의 가림)
  it('작은따옴표로 싼 파이썬 코드도 진짜 글로 본다', () => {
    for (const c of [`python3 -I -c 'exec("print(1)")'`, `python3 -I -c 'eval("1+1")'`, `python3 -I -c 'exec("imp" + "ort o" + "s")'`, `python3 -I -c 'import os; os.system("id")'`, `python3 -I -c 'open("a.txt", "w")'`])
      expect(stateOnlyCommand(c), c).toBe('no')
    expect(stateOnlyCommand(`python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["a"])' a.json`)).toBe('ok')
    expect(stateOnlyCommand("grep -n '$(x)' a.md")).toBe('ok')
  })
  // 11/25 검토 "분류기가 놓치는 것"
  it('zsh 전용 문법: =( ) · 무늬 꼬리표 · $=x 는 막는다', () => {
    for (const c of ['cat =(rm -rf x)', 'diff =(ls) =(ls)', "ls *(e:'rm -rf x':)", 'ls *(+f)', 'ls *(.)', '(cd x && ls)',
      'for x in ". -delete"; do find $=x; done', 'for x in a; do find . $~x; done', 'for x in a; do sort $^x; done'])
      expect(stateOnlyCommand(c), c).toBe('no')
    // 따옴표 · \\ 로 싼 괄호는 글자다
    for (const c of ['grep -E "(a|b)" x.md', 'find . \\( -name a -o -name b \\)', "echo 'f(x)'"]) expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('파이썬 주석 안의 따옴표로 open의 둘째 값을 숨기지 못한다', () => {
    expect(stateOnlyCommand(`python3 -I -c "import sys\nopen(sys.argv[1] # '\n, 'w') # ')" a.txt`)).toBe('no')
    expect(stateOnlyCommand(`python3 -I -c "import sys\nprint(len(sys.argv)) # count\nprint(1)"`)).toBe('ok')
  })
  it('gh api graphql: 질의를 변수 · 치환으로 넣으면 안을 볼 수 없어 막는다', () => {
    for (const c of ['gh api graphql -f query="$(cat q.txt)"', 'gh api graphql -f query="$Q"']) expect(stateOnlyCommand(c), c).toBe('no')
    expect(stateOnlyCommand("gh api graphql -f query='{ viewer { login } }'")).toBe('ok')
  })
  it('열쇠가 든 환경 변수를 펼치면 한 번 묻는다', () => {
    for (const c of ['echo $GITHUB_TOKEN', 'printf %s "$ANTHROPIC_API_KEY"', 'echo ${GH_TOKEN} | wc -c', 'echo $AWS_SECRET_ACCESS_KEY']) expect(stateOnlyCommand(c), c).toBe('sensitive')
    for (const c of ['echo $HOME', 'echo $MAX_TOKENS', 'echo $TOKENIZER_PATH']) expect(stateOnlyCommand(c), c).toBe('ok')
    expect(touchesSecret('curl -H "Authorization: Bearer $GITHUB_TOKEN" https://x')).toBe(true)
    expect(touchesSecret('echo $PWD')).toBe(false)
  })
  it('중앙의 푸시: heads/main 도 main이다', () => {
    for (const c of ['git push origin x:heads/main', 'git push origin heads/main', 'git push origin x:refs/heads/master']) expect(stateOnlyCommand(c, { gitWrites: true }), c).toBe('no')
    expect(stateOnlyCommand('git push origin x:heads/feature', { gitWrites: true })).toBe('ok')
  })
  // 11/25 별도 검토: 상태 보기로 통과하던 꼴
  it('주석 · 치환 안의 따옴표로 뒤 명령을 숨기지 못한다', () => {
    for (const c of ["git status # '\ngit push --force origin main # '", `echo $(echo ")" ; rm -rf x) '"'`, "ls # '\nrm -rf x # '"]) expect(stateOnlyCommand(c), c).toBe('no')
    expect(stateOnlyCommand('git status # 지금 상태')).toBe('ok')
    expect(stateOnlyCommand(`echo $(echo ")")`)).toBe('ok')
  })
  it('히어독처럼 보이는 << 뒤의 줄도 명령으로 본다', () => {
    for (const c of [`echo "a $(echo "<<'true' ")"\necho \`rm -rf x\`\ntrue`, `echo "a $(echo "<<true ")"\nfind . -del''ete\ntrue`]) expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('수천 겹 겹친 따옴표 · 치환은 넘어지지 않고 막는다', () => {
    for (const c of ['echo "$('.repeat(5000), `${'echo "$('.repeat(5000)}ls${')"'.repeat(5000)}`]) expect(stateOnlyCommand(c)).toBe('no')
  })
  it('펼친 값이 옵션이 되는 꼴: 변수 고치기 · 치환 출력', () => {
    for (const c of [
      'for x in a-delete; do find . ${x#a}; done', 'for x in a; do find . $x:s/a/-delete/; done', 'find . ${PWD##*}-delete', 'for x in a; do sort $x[1]; done',
      "find . -name x$(printf ' -o -delete')", "sort a$(printf ' -o out')", 'git grep $(git log -1 --format=-Orm) TODO', 'git log $(git log -1 --format=--output=README.md)',
    ]) expect(stateOnlyCommand(c), c).toBe('no')
    for (const c of ['git log $(git merge-base main HEAD)..HEAD --oneline', 'git diff $(git merge-base origin/main HEAD)', 'echo $(git rev-parse HEAD)', 'for f in a.md b.md; do sort $f; done', 'ls $(git rev-parse --show-toplevel)'])
      expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('파이썬: _ 로 시작하는 이름 · 다른 모듈에서 꺼낸 모듈은 막는다', () => {
    for (const c of [
      `python3 -I -c 'from collections import _sys; print(_sys.argv)'`, `python3 -I -c 'from pprint import _sys; _sys.modules["o"+"s"].system("id")'`,
      `python3 -I -c "from pprint import (\n_sys)\nprint(_sys.path)"`, `python3 -I -c 'from json import codecs; codecs.open("r", "w")'`,
    ]) expect(stateOnlyCommand(c), c).toBe('no')
    expect(stateOnlyCommand(`python3 -I -c 'import json, sys; d = json.load(open(sys.argv[1])); print(len(d), d.get("a_b"))' a.json`)).toBe('ok')
  })
  it('gh: 붙여 쓴 짧은 옵션은 읽지 않고 막는다', () => {
    for (const c of ['gh api -iXDELETE repos/o/r/git/refs/heads/main', 'gh api repos/o/r/issues -if title=x', "gh api /graphql -if query='mutation{x}'", 'gh auth status -at', 'gh pr view 1 -cw'])
      expect(stateOnlyCommand(c), c).toBe('no')
    for (const c of ['gh api -XGET repos/o/r/pulls', 'gh api repos/o/r -q .name', 'gh auth status']) expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('git fetch의 강제 · 로컬 가지로 받기, jq의 환경 변수', () => {
    for (const c of ['git fetch -fu origin x:main', 'git fetch origin x:main', 'git fetch --force origin']) expect(stateOnlyCommand(c, { gitWrites: true }), c).toBe('no')
    for (const c of ['git fetch origin', 'git fetch --prune origin main']) expect(stateOnlyCommand(c, { gitWrites: true }), c).toBe('ok')
    for (const c of ['jq -n env', "jq -n '$ENV.GITHUB_TOKEN'", 'jq -r env.HOME a.json']) expect(stateOnlyCommand(c), c).toBe('no')
    expect(stateOnlyCommand("jq '.environment' a.json")).toBe('ok')
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

describe('묻지 않고 지나가던 꼴 (11/24 검토)', () => {
  it('작은따옴표 안의 $( · 백틱 사이에 낀 명령, find -exec의 홀로 선 +, 붙여 쓴 짧은 옵션, >&2file', () => {
    for (const c of [
      "echo '$(echo ' ; rm -rf x ; echo ')'",
      "echo '`echo ' ; rm -rf x ; echo '`'",
      'find f.txt -exec sort -t + -o out.txt {} \\;',
      'find . -maxdepth 0 -exec git log -S + --output=victim.txt \\;',
      'git grep -lOrm TODO',
      'tree -ao out.txt',
      'ps -axE',
      'echo x >&2file',
      'echo x >&2026-11-24.md',
    ]) expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('보통 꼴은 그대로 지나간다', () => {
    for (const c of [
      "find . -name '*.ts' -exec grep -l foo {} +",
      "echo '$(date)'",
      'echo x >&2',
      'ls 2>&1',
      'git grep -n TODO',
      'tree -a',
      'ps -ax',
    ]) expect(stateOnlyCommand(c), c).toBe('ok')
  })
})

describe('비밀이 든 곳을 건드리는 명령 (자동 모드에서 한 번 묻는다)', () => {
  it('명령 줄의 낱말마다 본다: 앞에 ./ 가 없어도, cd로 들어가도', () => {
    for (const c of ['cat .env', 'grep KEY .env.local', 'cat ~/.netrc | grep machine', 'cd ~/.aws && cat config', 'cat ./.env', '/u/p/.env']) expect(touchesSecret(c), c).toBe(true)
    for (const c of ['cat README.md', 'ls src/environment.ts', 'pnpm test', 'echo .envrc-notes']) expect(touchesSecret(c), c).toBe(false)
  })
})

describe('gh api · gh --web · uniq 의 둘째 이름 (11/26 검토: 옵션의 값을 메서드로 읽어 쓰기가 지나갔다)', () => {
  it('값을 받는 옵션의 값은 메서드 · 주소가 아니다: 몸을 붙이고 GET 을 적지 않은 것은 POST 다', () => {
    for (const c of ['gh api repos/o/r/issues -f title=x -p graphql', 'gh api repos/o/r/issues -f title=x -p -XGET', 'gh api repos/o/r/issues -f title=x -q --method=GET', 'gh api repos/o/r/issues -f title=x -t -XGET',
      'gh api repos/o/r/issues -f title=x -H -XGET', 'gh api repos/o/r/issues -f title=x --cache -XGET', 'gh api repos/o/r/actions/workflows/ci.yml/dispatches -f ref=main -p -XGET', 'gh api repos/o/r/issues -f title=x --jq graphql',
      'gh api repos/o/r/issues -f title=x --preview=graphql', 'gh api repos/o/r/issues -f title=x -p -XGET 2>&1 | tail -3'])
      expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('모르는 옵션 · 주소가 둘 · 메서드를 두 번 적은 것은 막는다', () => {
    for (const c of ['gh api a b', 'gh api --unknown a', 'gh api -X GET -X POST a', 'gh api --method=GET --method=DELETE a', 'gh api -X', 'gh api', 'gh api -f a=b', 'gh api -- a b', 'gh api a -- b', 'gh api --paginate=x a', 'gh api -iXDELETE a', 'gh api -if a=b x'])
      expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('파일 · 입력을 읽어 보내는 것과 다른 곳으로 보내는 것은 막는다', () => {
    for (const c of ['gh api -X GET repos/o/r/commits -F sha=@/etc/hosts', 'gh api --method GET repos/o/r/commits -F sha=@../other/file', 'gh api -X GET search/code -F q=@-', 'gh api -X GET a --field=x=@f',
      'gh api https://other.example/x', 'gh api --hostname other.example user', 'gh api user --hostname=other.example', 'gh --help=false api https://other.example/x', 'gh --help=false pr view 1',
      'gh api -XGET a -Fb=@f'])
      expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('읽기는 그대로 묻지 않는다', () => {
    for (const c of ['gh api -XGET repos/o/r/pulls', 'gh api repos/o/r -q .name', 'gh api -X GET search/issues -f q=x', 'gh api --method=GET a -F per_page=100', "gh api graphql -f query='{ viewer { login } }'",
      'gh api repos/x/y/pulls --paginate --jq ".[].number"', 'gh api -H "Accept: application/vnd.github+json" repos/o/r', 'gh api repos/o/r -i', 'gh api /repos/o/r', 'gh api repos/o/r --cache 1h', 'gh --version',
      'gh api user -q.login', 'gh api -X GET search/code -f q=@scope/pkg', 'gh api repos/o/r/pulls --paginate=true', 'gh api --hostname github.com user', 'gh api -- repos/o/r/pulls', "gh api /graphql -f query='{ viewer { login } }'"])
      expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('--web=true 도 브라우저를 연다', () => {
    for (const c of ['gh pr view 1 --web=true', 'gh pr list --web=1', 'gh repo view --web=true', 'gh search repos x --web=true']) expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('uniq 의 둘째 이름은 쓸 파일: 입력을 뜻하는 - 와 -- 뒤의 낱말도 센다', () => {
    for (const c of ['cat f | uniq - out.sh', 'uniq -c - out', 'uniq -- - out', 'uniq -- -a out', 'uniq -f1 - out']) expect(stateOnlyCommand(c), c).toBe('no')
    for (const c of ['uniq a', 'uniq -c a', 'cat f | uniq -c -', 'cat f | uniq', 'uniq -- a', 'cat f | uniq -f 1 -', 'uniq -s 2 a']) expect(stateOnlyCommand(c), c).toBe('ok')
    for (const c of ['uniq -f 1 - out', 'uniq -f x out']) expect(stateOnlyCommand(c), c).toBe('no')
  })
  it('하위 명령은 무리 바로 뒤의 낱말: 사이의 옵션은 다음 낱말을 값으로 삼켜 다른 하위 명령이 돈다 (둘째 검토)', () => {
    for (const c of ['gh repo -r view create newname --source=. --public --push', 'gh pr -r view merge', 'gh pr -r checks merge', 'gh pr -a view review', 'gh workflow -r view run ci.yml', 'gh gist -r view edit abc',
      'gh pr -r view create --fill', 'gh issue -a view create --title x --body y', 'gh pr --json view merge', 'gh search -a repos x'])
      for (const o of [{}, { gitWrites: true }]) expect(stateOnlyCommand(c, o), c).toBe('no')
    expect(stateOnlyCommand('gh pr merge 3 --squash', { gitWrites: true })).toBe('ok')
    expect(stateOnlyCommand('gh pr -R o/r merge 3 --squash', { gitWrites: true })).toBe('no')
  })
  it('주소에 graphql 글자만 든 것은 graphql 이 아니다: 몸을 붙이면 POST 다 (셋째 검토)', () => {
    for (const c of ["gh api 'repos/o/r/issues?graphql' -f title=x", 'gh api repos/o/graphql-js/issues -f title=x', 'gh api repos/graphql/x/issues/1/comments -f body=hello', "gh api 'user/repos?graphql' -f name=x",
      "gh api 'repos/o/r/actions/workflows/ci.yml/dispatches?graphql' -f ref=main", "gh api graphql/ -X GET -f query='mutation { x }'", "gh api /graphql/ -f query='mutation { x }'", "gh api GRAPHQL -f query='{ viewer { login } }'"])
      expect(stateOnlyCommand(c), c).toBe('no')
    for (const c of ["gh api 'search/code?q=graphql+mutation'", 'gh api repos/o/graphql-js/issues', "gh api graphql/ -f query='{ viewer { login } }'", 'gh api -X GET repos/o/graphql-js/issues -f state=open'])
      expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('붙여 쓴 짧은 옵션 속의 -R 도 저장소 이름을 받는다 (셋째 검토)', () => {
    for (const c of ['gh pr view 1 -cR other.example/o/r', 'gh pr view 1 -cRother.example/o/r', 'gh pr view 1 -cR=other.example/o/r', 'gh issue view 1 -cR other.example/o/r', 'gh pr list -dR other.example/o/r',
      'gh run view 1 -vR other.example/o/r', 'gh workflow list -aR other.example/o/r'])
      expect(stateOnlyCommand(c), c).toBe('no')
    expect(stateOnlyCommand('gh pr create --title x --body y -dR other.example/o/r', { gitWrites: true })).toBe('no')
    for (const c of ['gh pr view 1 -cR o/r', 'gh pr list -R o/r']) expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('값을 받는 옵션을 겹쳐 적어 저장소 이름을 가리는 꼴 (넷째 검토): 옵션의 값은 한 번씩만 뺀다', () => {
    for (const c of ['gh repo view -b -b other.example/o/r', 'gh repo view --json name -q -b other.example/o/r', 'gh repo view -b --json other.example/o/r', 'gh repo view --branch --branch ghes/o/r',
      'gh repo view -t -t other.example/o/r --json name', 'gh repo view --json name --jq -L other.example/o/r', 'gh repo view --json name -q -b other.example/o/r 2>&1 | head -5'])
      expect(stateOnlyCommand(c), c).toBe('no')
    for (const c of ['gh repo view -b a/b/c', 'gh repo view o/r -b a/b/c', 'gh repo view o/r --json name -q .name', 'gh repo list someone -L 5 --json name']) expect(stateOnlyCommand(c), c).toBe('ok')
  })
  it('제목 · 본문 · 찾을 말 속의 주소와 가지 이름은 다른 곳이 아니다', () => {
    for (const c of ["gh pr view 1 --json url,body --jq '.body | test(\"https://\")'", "gh pr list --search 'in:body https://example.com'", "gh search issues 'git@github.com' --repo o/r", 'gh gist view https://gist.github.com/abc',
      'gh repo view -b release/1.0/x', 'gh repo view o/r -b a/b/c', 'gh repo view https://github.com/o/r'])
      expect(stateOnlyCommand(c), c).toBe('ok')
    // 주소로 시작하는 낱말은 자리를 가리지 않고 막는다(옵션의 값인지 이름인지 다 알 수 없다): 찾을 말이 주소로 시작하면 묻는다
    expect(stateOnlyCommand("gh pr list --search 'https://example.com in:body'")).toBe('no')
    for (const c of ["gh pr create --title 'fix https://example.com/issue link' --body y", "gh pr edit 5 --body 'docs: https://docs.example.com/a'"]) expect(stateOnlyCommand(c, { gitWrites: true }), c).toBe('ok')
  })
  it('다른 곳을 가리키는 gh 는 막는다: github.com 이 아닌 주소 · git@호스트 · 호스트가 붙은 저장소 이름', () => {
    for (const c of ['gh pr view 1 -R other.example/o/r', 'gh pr view 1 --repo other.example/o/r', 'gh pr view 1 --repo=other.example/o/r', 'gh pr view 1 -Rother.example/o/r', 'gh pr view https://other.example/o/r/pull/1',
      'gh issue view https://other.example/o/r/issues/1', 'gh repo view other.example/o/r', 'gh pr view 1 -R git@other.example:o/r', 'gh repo view git@other.example:o/r', 'gh pr list --repo=git@other.example:o/r',
      'gh pr view 1 -R ghes/o/r', 'gh repo view localhost/o/r', 'gh pr view 1 -R host:o/r'])
      expect(stateOnlyCommand(c), c).toBe('no')
    for (const c of ['gh pr view 1 -R o/r', 'gh pr view 1 --repo=o/r', 'gh repo view o/r', 'gh repo view', 'gh pr view https://github.com/o/r/pull/1', 'gh repo list someone', 'gh repo view o/r --json name,url', "gh pr list -S 'path:a.b/c/d'",
      "gh search code 'foo.bar/baz/qux'"])
      expect(stateOnlyCommand(c), c).toBe('ok')
  })
})
