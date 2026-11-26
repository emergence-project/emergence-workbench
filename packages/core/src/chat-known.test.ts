// 끝까지 읽은 명령만 묻지 않고 지나가기 (11/26 사용자 결정, 설계 docs/specs/2026-11-26-command-verdict-read-fully.md)
import { describe, expect, it } from 'vitest'
import { dataHeredocsRemoved, unreadWhy } from './chat-known.js'

const why = (c: string) => unreadWhy(c)?.why

describe('읽은 것으로 치는 줄 (설계 5.2)', () => {
  it('아는 프로그램과 셸 문법만으로 된 줄', () => {
    for (const c of [
      'pnpm test', 'git status && git diff --stat', 'cd apps/server && pnpm vitest run src/x.test.ts', 'ls -la | head -20',
      'for f in src/*.ts; do wc -l "$f"; done', 'x=$(git rev-parse HEAD); echo "$x"', 'set -e; ls', 'set -euo pipefail; pnpm test',
      '[[ -f x ]] && echo y', '(( n++ ))', 'echo $(( 1 + 2 ))', 'test -d x || mkdir -p x', 'while read l; do echo "$l"; done < f',
      'CI=1 pnpm test', 'NODE_ENV=test node x.js', 'CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm shots', 'export FOO=1',
      'time pnpm test', 'timeout 5 pnpm test', 'nohup node s.js &', 'echo `whoami`', 'gh pr view 12', 'lsof -i :5173 | head',
      './scripts/x.sh', 'scripts/check.mjs a', '/opt/homebrew/bin/python3 x.py', 'sh -c "rm x"', 'xargs -n1 echo', 'x=out; cp a "$x"',
      'cp a "$HOME/x"', 'ls > out.txt 2>&1', 'git log $(git merge-base a b)..HEAD', 'python3 -c "import os; os.system(1)"',
      'find . -name "$pat"', 'cat <<< "$x"',
      // 11/26 실제 기록 비교에서 나온 것: grep의 인자 변수 · 홈 아래 프로그램 · 값이 $PWD 인 환경 변수 · 무늬를 그대로 두는 setopt
      'f=$(git ls-files | grep x); grep -n y $f', '~/.cargo/bin/cargo check', 'SHOTS_DIR=$PWD/out pnpm shots', 'setopt nonomatch; ls *.x', 'setopt nullglob 2>/dev/null; ls',
    ]) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('자료를 주는 히어독: 본문의 따옴표 · 괄호 · 명령 같은 글은 읽지 않는다', () => {
    for (const c of [
      `git commit -m "$(cat <<'EOF'\nIt's fine (really)\n\nCo-Authored-By: x\nEOF\n)"`,
      `cat > /tmp/x.md <<'EOF'\nhello world\n$(rm x)\neval y\nEOF`,
      `python3 - <<'EOF'\nimport os\nprint("a)")\nEOF`,
      `cat <<EOF > notes.md\nplain text, no dollar\nEOF\nls`,
      `cat <<-'EOF'\n\tsetopt x\n\tEOF`,
    ]) expect(unreadWhy(c), c).toBeUndefined()
  })
})

describe('읽지 못한 줄 (설계 5.2 가 · 나 · 다)', () => {
  it('가. 모르는 프로그램은 이름과 함께', () => {
    expect(unreadWhy('foo bar')).toEqual({ why: 'prog', name: 'foo' })
    expect(unreadWhy('make build')).toEqual({ why: 'prog', name: 'make' })
    expect(unreadWhy('../x.sh')).toEqual({ why: 'prog', name: 'x.sh' })
    expect(unreadWhy('~/bin/x')).toEqual({ why: 'prog', name: '~/bin/x' })
    expect(why('X=$PWD$(ls) pnpm test')).toBe('env')
    // 감싸 돌리는 안의 명령도 (find -exec · xargs · sh -c · 치환)
    for (const c of ['find . -exec foo {} \\;', 'echo hi | xargs bar', 'sh -c "baz"', 'echo $(qux)', 'echo <(qux)', 'nice -n 5 qux']) expect(why(c), c).toBe('prog')
    // 실행 「늘」로 허락한 프로그램은 안다
    expect(unreadWhy('foo bar', { known: (p) => p === 'foo' })).toBeUndefined()
  })
  it('가. 변수 · 치환 · 무늬로 만든 프로그램 이름', () => {
    for (const c of ['$cmd -rf x', '"$p" a', '${p} a', '$(which x) a', '* a', 'sh -c "$x"', '~u/x']) expect(why(c), c).toBe('var-prog')
  })
  it('나. 풀지 못한 치환 · 다 넣어 보지 못한 변수', () => {
    expect(why('echo $(ls')).toBe('subst')
    const many = Array.from({ length: 30 }, (_, i) => `v${i}`).join(' ')
    expect(why(`for a in ${many}; do for b in ${many}; do echo; done; done; x=1; for c in ${many}; do :; done; echo $a$b$c`)).toBeDefined()
  })
  it('나. 다른 프로그램을 바꾸는 환경 변수 (글자 값이라도)', () => {
    for (const c of ['PATH=/tmp:$PATH ls', 'GIT_PAGER=cat git log', 'LESSOPEN="|x" less f', 'export PATH=/x:$PATH', 'PATH=.; ls', 'NODE_OPTIONS=--require=./x node a']) expect(why(c), c).toBe('env')
    // 그 밖의 이름이라도 값이 글자 그대로가 아니면
    expect(why('FOO=$(ls) pnpm test')).toBe('env')
  })
  it('나. 무늬 한정자의 코드 · zsh 펼침 플래그', () => {
    for (const c of ['ls *(e:rm:)', 'ls *(+f)', 'ls ${(f)x}', 'echo ${(e)x}', 'ls $~pat', 'ls ${=x}', 'echo ${!name}']) expect(why(c), c).toBe('syntax')
  })
  it('다. 다시 읽히는 글 · 다루지 않는 문법', () => {
    for (const c of ['eval "$x"', 'source ~/.zshrc', '. ./env.sh', 'exec bash', 'trap "rm x" EXIT', 'alias ls=rm', 'builtin cd x', 'noglob ls *',
      'repeat 3 ls', 'coproc ls', 'select x in a b; do ls; done', 'case $x in a) ls;; esac', 'setopt shwordsplit; ls', 'setopt nonomatch shwordsplit', 'unsetopt x', 'f() { ls; }; f',
      'function f { ls; }', 'time eval x', 'set -o noglob', 'set +e -f', 'emulate sh', 'r', 'fc -e - ', 'hash -d x=/tmp']) expect(why(c), c).toBe('syntax')
  })
  it('다. 옵션을 가리는 프로그램의 인자 맨 앞에 값을 모르는 변수', () => {
    for (const c of ['find . $x', 'git $sub', 'sort $o f', 'rg $flag x', 'rsync $o a b', 'xargs $o echo', 'read x; awk $x f']) expect(why(c), c).toBe('var')
  })
  it('다. 쓰기 대상에 값을 모르는 변수 · 치환', () => {
    for (const c of ['cp a "$dest"', 'ls > "$out"', 'mv a $(pwd)/b', 'tee "$f" < x', 'for f in *; do cp a "$f"; done']) expect(why(c), c).toBe('var')
  })
  it('본문을 셸이 받는 히어독은 본문도 읽는다', () => {
    expect(why('cat <<EOF | sh\nfoo\nEOF')).toBeDefined()
    expect(why("bash <<'EOF'\nfoo\nEOF")).toBeDefined()
    // 펼쳐지는 본문(따옴표 없는 구분자에 $)은 빼지 않는다
    expect(why('cat <<EOF\n$(foo)\nEOF')).toBe('prog')
  })
})

// 11/26 따로 한 검토에서 나온 꼴: 읽은 것으로 잘못 치던 줄
describe('검토에서 나온 꼴', () => {
  it('<< 를 잘못 짚은 줄은 빼지 않는다 (주석 · 역슬래시 · 따옴표 안)', () => {
    for (const c of ["cat # <<'E'\nzzevil\nE", "cat \\<<'E'\nzzevil\nE", `cat "<<'E'"\nzzevil\nE`, "echo '<<E'\nzzevil\nE"]) expect(why(c), c).toBeDefined()
  })
  it('셸에 입력으로 코드를 넘기기', () => {
    for (const c of ["echo 'rm -rf ~' | zsh", 'echo x | base64 -d | sh', "printf 'x' | xargs -0 sh -c", 'bash -s < f', 'cat f | bash']) expect(why(c), c).toBe('syntax')
    for (const c of ['sh scripts/x.sh', "bash -c 'ls'", "find . -exec sh -c 'ls \"$1\"' _ {} \\;", "zsh -lc 'pnpm test'"]) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('대입 꼴이 아닌 방법으로 찾는 길 · 폴더 · 낱말 나누기 바꾸기', () => {
    for (const c of ['printf -v PATH %s /x; ls', 'read -r PATH < f; git status', 'read -A path <<< /x; ls', ': ${PATH::=/x}; ls', 'read PWD <<< /x; touch $PWD/a', 'read IFS <<< _; ls', 'printf -v IFS _', ': ${IFS:=_}', 'PWD=/x; touch $PWD/a', 'GOFLAGS=-toolexec=/x go build', 'RUSTFLAGS=-Cx cargo build', 'PIP_INDEX_URL=x python3 -m pip download x']) expect(why(c), c).toBe('env')
    for (const c of ['read -r line < f; echo "$line"', 'printf -v out %s a; echo "$out"']) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('셈 안의 배열 첨자에 든 명령 (bash)', () => {
    for (const c of ["(( 'a[$(rm -rf x)]' ))", "x='a[$(rm x)]'; (( x ))", "[[ 1 -eq 'a[$(x)]' ]]", "read 'a[$(x)]' <<< x", "[ -v 'a[`x`]' ]", "(( 'a[b[0]+$(x)]' ))"]) expect(why(c), c).toBeDefined()
    // 값을 밖에서 받은 이름이 셈에 쓰이면 (파일에 a[$(…)] 를 써 둘 수 있다)
    for (const c of ['read x < f; (( x ))', 'read x < f; echo ${a[x]}', 'x=$(cat f); [[ $x -eq 0 ]]', 'mapfile -t l < f; (( l + 1 ))', 'printf -v n %s 1; let n++']) expect(why(c), c).toBe('var')
    for (const c of ['n=3; (( n++ ))', 'x=$(wc -l < f); echo "$x"', '[[ -f x ]]', 'for i in 1 2; do (( i % 2 )); done']) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('옵션 · 하위 명령으로 받은 글을 돌리거나 쓰는 것', () => {
    for (const c of ["git -c alias.l='!rm x' l", "git grep -O'cmd' x", "git -c core.fsmonitor='cmd' status", "git config core.pager 'rm x'", "git config alias.st '!x'", 'git rebase -x "make" main', 'git bisect run x', 'git submodule foreach ls', 'git difftool',
      "sed -n '1e rm x' f", "sed 'w /x/y' f", "sed 's/a/b/e' f", 'sed -f s.sed f', `awk 'BEGIN{system("x")}'`, `awk '{print > "/x/y"}' f`, `awk '{print | "sh"}' f`, 'rg --pre=sh x .', 'rg --pre sh x .', 'sort --compress-program=sh -S 1 f',
      'rsync -e sh a b', 'env -C /x tee y < f', "env -S 'zzfoo a'"]) expect(why(c), c).toBe('syntax')
    for (const c of ['git config --get user.name', 'git config user.name', 'git -C sub status', 'git commit -c HEAD', "sed -n '1,5p' f", "sed -i 's/a/b/g' f", "awk '{print $1}' f", "awk -F, '$3 > 100 {print $1}' f", 'rg -n x .', 'sort -u f', 'env CI=1 pnpm test']) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('아는 이름이라도 시스템 · 패키지 관리자 폴더 밖의 경로는 경로 전체를 이름으로', () => {
    for (const c of ['/w/evil/git status', '~/Downloads/node x.js', '/tmp/e/ls']) expect(unreadWhy(c), c).toEqual({ why: 'prog', name: c.split(' ')[0] })
    for (const c of ['/usr/bin/git status', '/opt/homebrew/bin/python3 x.py', '~/.cargo/bin/cargo check', '/bin/ls']) expect(unreadWhy(c), c).toBeUndefined()
    expect(unreadWhy('/w/x/foo', { known: (p) => p === '/w/x/foo' })).toBeUndefined()
    expect(unreadWhy('/w/x/foo', { known: (p) => p === 'foo' })).toBeDefined()
  })
  it('실제 기록의 sed · 히어독은 읽은 것', () => {
    for (const c of [`sed -i '' "19s/appEnv, notStarted,/appEnv, notStarted, x,/" a.ts`, `sed -n '/<\\/style>/,$p' a.html`, `sed 's/<style>.*<\\/style>//' a`, "sed 's#from .x.#from \"y\"#' a > b", `sed -i '' 's/padding-inline: 4px; }/padding-inline: var(--sp-1); }/' a.css`,
      "sed -i '' '150{/eslint-disable/d;}' a", `sed -i '' -e "180s/a/b/" -e 's/\\.slice(-400)/.slice(-1000)/' a`, "sed -i '' 's/stays 134 screens/stays 135 screens/; s/x, 134)/x, 135)/g' a",
      "grep -o -- '--(a|b):' x | sort -u; python3 - <<'EOF'\nopen(p,'w').write(s)\nEOF", `perl -0pi -e "s|a \\{ b \\}|c|" x && cat >> y <<'EOF'\ndescribe('a (b), c', () => {\nEOF`]) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('히어독이 여럿인 줄 · sed a\\ 이어 쓰기', () => {
    expect(unreadWhy("cat > a.ts <<'EOF'\nconst x = `${a}` ((b))\nEOF\npython3 - <<'EOF'\nimport os\nprint(1)\nEOF\ncat > b.ts <<'EOF'\nls *(e:x:)\nEOF")).toBeUndefined()
    expect(unreadWhy("sed -i '' '1239a\\\n  \"a\": \"b\",' x.json")).toBeUndefined()
    expect(why("sed -i '' '1a\\\nx\n1e rm' f")).toBe('syntax')
  })
  it('tar는 모르는 프로그램이라 어차피 묻는다', () => expect(unreadWhy('tar --to-command=sh -xf a.tar')).toBeDefined())
  it('아주 긴 글도 금방 끝난다', () => {
    const big = 'cat <<E x\n' + 'a\n'.repeat(60_000)
    const t = Date.now(); unreadWhy(big); expect(Date.now() - t).toBeLessThan(3000)
  })
})

describe('검토 2차에서 나온 꼴', () => {
  it('sed: 아는 옵션만, 주석 · 괄호 식 안의 / 는 구분자가 아니다', () => {
    for (const c of ["sed -ne '1e x' -e p f", "sed -l 5 '1e x' f", "sed --e='1e x' f", "sed -n '#/\n1e x\n#/' f", "sed -n '/[/]/e x' f", "sed -n 's/[/]//e' f", 'sed $s f']) expect(why(c), c).toBe('syntax')
  })
  it('히어독: 앞 줄의 따옴표 · 셈 · 펼침 · here-string 안의 << 는 빼지 않는다', () => {
    for (const c of [`echo "\ncat <<'E'\n"; zzevil\nE`, 'echo $((cat<<E))\nzzevil\nE', '(( cat<<E ))\nzzevil\nE', 'cat <<<E\nzzevil\nE', 'cat ${x#<<E}\nzzevil\nE', 'cat ${x/<<E/}\nzzevil\nE']) expect(why(c), c).toBeDefined()
  })
  it('셸: 작업 폴더 안 스크립트 파일 · -c 글만', () => {
    for (const c of ['echo x | bash /dev/stdin', 'echo x | bash -o errexit', 'echo x | bash +e', 'bash <(echo x)', 'bash -O extglob']) expect(why(c), c).toBe('syntax')
    for (const c of ['bash scripts/x.sh a', 'bash -e scripts/x.sh', 'bash -o pipefail -c "ls"', 'zsh -lc "pnpm test"']) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('git: 줄인 긴 옵션 · 묶은 짧은 옵션 · config 쓰기', () => {
    for (const c of ["git grep --open-files='x' y", "git config core.fsmonitor 'x' --get", "git grep -iO'x' y", 'git log -p --ext-dif', 'git --exec-path=/x status', 'git --paginate log']) expect(why(c), c).toBe('syntax')
    for (const c of ['git config --get user.name', 'git config --list', 'git config user.email', 'git --no-pager log -5', 'git -C sub diff --stat', 'git grep -n x', 'git log --oneline -5']) expect(unreadWhy(c), c).toBeUndefined()
  })
  it('env · awk · 이름 바꾸기 · sort · 경로', () => {
    for (const c of ['env -i -C /x tee y < f', 'env -u X -C /x tee y', 'env --ch=/x tee y', `awk 'BEGIN{print "}" > "/x/y"}'`, `awk 'BEGIN{print ";" | "sh"}'`, "awk -f p.awk f", "awk -i inplace '{print}' f", `awk '@f("x")'`, 'sort --compress=sh -S 1 f', 'sort --compress-prog=sh f']) expect(why(c), c).toBe('syntax')
    for (const c of ['printf -vPATH %s /x; ls', 'export IFS+=_; ls', 'local IFS+=_', 'RIPGREP_CONFIG_PATH=./cfg rg x .']) expect(why(c), c).toBe('env')
    expect(unreadWhy('/opt/pw-browsers/../../w/evil/git status')).toEqual({ why: 'prog', name: '/opt/pw-browsers/../../w/evil/git' })
    for (const c of ['env -i PATH_X=1 ls', "awk '{print $1}' f", "awk -F, -v n=2 '$n > 3 {print $1}' f", 'sort -u -k2 f']) expect(unreadWhy(c), c).toBeUndefined()
  })
})

describe('검토 3차에서 나온 꼴', () => {
  it('묻는다', () => {
    for (const c of ["sed -n 's/x/[/;e zz;#]/' f", "sed -n 's/[[:alpha:]/]/#/;e zz' f", "sed -n ':a;1e zz' f", 'read x < f; echo $[x]', 'read x < f; echo ${s:x}', "read x < f; printf -v 'a[x]' %s 1", 'read x < f; [[ -v a[x] ]]',
      'read "x" < f; (( x ))', 'printf -v "x" %s 1; (( x ))', 'for x in a*; do (( x )); done', "cat $'\\' x <<'E''\nzzevil\nE", 'cat $[x<<E]\nzzevil\nE',
      `awk 'BEGIN{x=1} $0~/"/{} BEGIN{system("x")} $0~/"/{}'`, `awk '$0~/"/{print 1 | "sh"}'`, "echo x | xargs -I{} sh -c {}", "find . -exec sh -c 'cat {}' \;", 'git merge -s ours x', 'git pull -s x']) expect(unreadWhy(c), c).toBeDefined()
  })
  it('지나간다', () => {
    for (const c of ["sed 's/[[:space:]]*$//' f", "sed -n '/^[a-z]/p' f", "sed 's/x/[y]/g' f", "sed -n ':a;N;ba' f", 'for f in *.md; do wc -l "$f"; done', 'for f in src/*.ts; do [[ -f $f ]] && echo $f; done', "awk '$3 > 100 {print $1}' f", 'x=${y:-a}; echo ${x:+b}']) expect(unreadWhy(c), c).toBeUndefined()
  })
})

describe('dataHeredocsRemoved', () => {
  it('자료 본문과 끝 줄을 빼고 받는 줄은 남긴다', () => {
    expect(dataHeredocsRemoved("cat > a <<'EOF'\nx\nEOF\nls")).toBe('cat > a </dev/null\nls')
    expect(dataHeredocsRemoved("sh <<'EOF'\nx\nEOF")).toBe("sh <<'EOF'\nx\nEOF")
  })
})

// 불변식 (설계 7절 1): 읽은 것으로 치는 조각만으로 만든 줄은 읽은 것, 읽지 못하는 조각이 하나라도 (감싸 돌리기 · 치환 안이라도) 들면 읽지 못한 것
describe('생성한 줄의 불변식', () => {
  const READ = ['pnpm test', 'ls -la', 'git status', 'cat a.txt', 'grep -n x f', 'echo "a b"', 'x=$(ls)', '[[ -f x ]]', '(( n++ ))', 'wc -l f', 'cd sub', 'node s.js',
    'python3 -c "print(1)"', 'for f in a b; do echo "$f"; done', 'test -d x', 'set -e', 'CI=1 pnpm build', 'mkdir -p out', 'cp a b', 'sleep 1', ': noop', 'true']
  const UNREAD = ['eval y', '$p a', 'setopt x', 'zzfoo', 'find . $y', 'GIT_PAGER=cat git log', 'ls ${(f)x}', 'cp a $z', 'source f', 'f() { ls; }', 'ls *(e:x:)',
    'PATH=/x ls', 'set -o noglob', 'alias a=b', 'exec ls', 'trap x EXIT', '"$q" b', 'git $w']
  const JOIN = [' ; ', ' && ', ' || ', ' | ', '\n']
  let seed = 7
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  const pick = <T,>(a: T[]) => a[rnd(a.length)]!
  const line = (n: number) => Array.from({ length: n }, () => pick(READ))
  const join = (parts: string[]) => parts.reduce((acc, p, i) => (i ? acc + pick(JOIN) + p : p), '')
  // 감싸기: 그대로 · 치환 안 · sh -c 안 · 묶음 안 · 앞말 뒤
  const wraps: ((s: string) => string)[] = [(s) => s, (s) => `echo "$(${s})"`, (s) => `sh -c '${s}'`, (s) => `{ ${s}; }`, (s) => `( ${s} )`, (s) => `time ${s}`, (s) => `if true; then ${s}; fi`]

  it('읽는 조각만으로 된 줄 2,000개는 모두 읽은 것', () => {
    for (let n = 0; n < 2000; n++) {
      const c = join(line(1 + rnd(5)))
      expect(unreadWhy(c), c).toBeUndefined()
    }
  })
  it('읽지 못하는 조각이 하나 든 줄 3,000개는 모두 읽지 못한 것', () => {
    for (let n = 0; n < 3000; n++) {
      const parts = line(rnd(5))
      const bad = pick(UNREAD)
      // sh -c '…' 안에는 작은따옴표 없는 조각만 (따옴표가 겹치면 다른 글이 된다)
      const wrap = pick(wraps)
      parts.splice(rnd(parts.length + 1), 0, bad.includes("'") ? bad : wrap(bad))
      const c = join(parts)
      expect(unreadWhy(c), c).toBeDefined()
    }
  })
})
