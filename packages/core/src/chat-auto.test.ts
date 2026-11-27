import { describe, expect, it } from 'vitest'
import { autoCustom, autoOf, commandKind, presetAuto, runProgram, runPrograms } from './chat-auto.js'
import { sedWrites } from './chat-sed.js'

const o = { cwd: '/u/p', home: '/u', inside: (a: string) => a === '/u/p' || a.startsWith('/u/p/') || a.startsWith('/u/lib/') }
const k = (c: string) => commandKind(c, o)

describe('명령이 하는 일', () => {
  it('읽기: 보는 명령과 git 보기, 폴더 안 경로', () => {
    for (const c of ['ls', 'cat a.md | head -3', 'grep -rn x workbench', 'git log --oneline -5', 'git diff', 'find . -name "*.md"', "sed -n '1,5p' a.md", 'cd workbench && ls', 'cat /u/lib/x.md', 'wc -l a 2>&1', 'ls > /dev/null'])
      expect(k(c), c).toBe('read')
  })
  it('편집 · 삭제', () => {
    for (const c of ["sed -i '' 's/a/b/' a.md", 'mv a b', 'echo x > out.txt', 'git add . && git commit -m x', 'git checkout main'])
      expect(k(c), c).toBe('edit')
    for (const c of ['rm a.md', 'ls && rm -rf build', 'find . -name x -delete', 'git reset --hard', 'git checkout -- a.md', 'git clean -fd'])
      expect(k(c), c).toBe('delete')
  })
  it('실행: 모르는 프로그램', () => {
    for (const c of ['python run.py', 'julia x.jl', 'pnpm test', 'find . -exec wc {} ;', 'make']) expect(k(c), c).toBe('run')
  })
  it('외부: 폴더 밖 · 올리기 · 설치 · 내려받기', () => {
    for (const c of ['git push', 'curl https://x', 'pip install numpy', 'pnpm add zod', 'python -m pip install x', 'ls ~/Desktop', 'cat /etc/hosts', 'echo x > ../other/a', 'cd .. && ls', 'ls $(curl x)', 'sudo ls'])
      expect(k(c), c).toBe('outside')
    expect(k('ls /tmp/x')).toBe('read')
  })
  // 11/25: 작은따옴표 안을 가린 채로 판정해 안의 명령이 보이지 않았다 (#681의 가림)
  it('작은따옴표로 싼 코드 · 명령도 진짜 글로 본다', () => {
    expect(k(`awk '{system("rm x")}' a.txt`)).toBe('run')
    expect(k("sh -c 'echo $(rm -rf x)'")).toBe('delete')
    expect(k("bash -c '(rm -rf x)'")).toBe('delete')
    expect(k("zsh -c 'cd sub && (git push)'")).toBe('outside')
    // 가림 자체는 그대로: 작은따옴표 안의 $( 는 치환이 아니고, 그 사이의 명령을 가리지 못한다
    expect(k("echo '$(echo ' ; rm -rf x ; echo ')'")).toBe('delete')
    expect(k("grep -n '$(x)' a.md")).toBe('read')
    expect(k("grep -n '$HOME/.config' a.md")).toBe('read')
  })
  // 11/25 검토 "분류기가 놓치는 것": 아래 꼴들이 읽기 · 실행으로 지나갔다
  it("$'…' 따옴표: 안의 \\' 로 뒤 명령을 숨기지 못하고, 풀어 쓴 이름을 읽는다", () => {
    expect(k("echo $'a\\'' ; rm -rf x ; echo '")).toBe('delete')
    expect(k("$'\\x72m' -rf x")).toBe('delete')
    expect(k("$'rm' x")).toBe('delete')
    expect(k("git $'pu\\x73h'")).toBe('outside')
    expect(k("echo $'a\\nb' $\"c\"")).toBe('read')
    // 큰따옴표 안의 $' 는 글자다
    expect(k(`echo "$'x'" && ls`)).toBe('read')
  })
  // 11/25 별도 검토에서 나온 꼴: 따옴표가 어디서 닫히는지를 셸과 다르게 읽으면 그 뒤의 명령이 숨는다
  it("따옴표 · 주석 · 치환의 끝을 셸처럼 읽는다", () => {
    for (const c of [
      // $'…' 는 \\ 다음 한 글자만 넘긴다: \\c 뒤의 따옴표는 닫는 따옴표다
      "echo $'\\c' ; rm -rf x ; echo 'a'",
      // 주석 안의 따옴표는 따옴표가 아니다 (주석은 줄 끝에서 끝난다)
      "git status # '\nrm -rf x # '",
      "echo a # it's\nrm -rf x # that's",
      // $( … ) 안의 따옴표 친 ) 는 치환을 닫지 않는다
      `echo $(echo ")" ; rm -rf x) '"'`,
      'echo $(rm -rf x "(")',
      // 줄 잇기 (\\ + 줄바꿈)
      'r\\\nm -rf x',
      // 스물한 번째 치환도 본다
      `${'echo $(true) ; '.repeat(21)}echo $(rm -rf x)`,
    ]) expect(k(c), c).toBe('delete')
    expect(k('echo x >\\\n~/out.txt')).toBe('outside')
    expect(k("echo '# not a comment' ; ls")).toBe('read')
    expect(k('echo a#b $# ${#x} ; ls')).toBe('read')
  })
  it('수천 겹 겹쳐도 넘어지지 않고 무겁게 본다', () => {
    for (const c of ['echo "$('.repeat(5000), `${'echo "$('.repeat(5000)}rm -rf x${')"'.repeat(5000)}`, `${'cat <('.repeat(20000)}ls${')'.repeat(20000)}`, `${'sh -c '.repeat(2000)}ls`])
      expect(['run', 'delete', 'outside']).toContain(k(c))
    expect(runPrograms(`${'echo $('.repeat(3000)}ls${')'.repeat(3000)}`)).toEqual([])
  })
  it('앞말은 경로로 적어도, 옵션이 붙어도 뗀다', () => {
    for (const c of ['/usr/bin/time rm -rf x', 'command -p rm x', 'nohup -- rm x', 'nice -10 rm x', 'nice -n5 rm x', 'exec -a name rm x', '/usr/bin/nohup rm x']) expect(k(c), c).toBe('delete')
    expect(k('command -v rm')).toBe('read')
  })
  it('zsh: =( ) 와 무늬 꼬리표 (e:명령:) · (+이름)이 돌리는 명령', () => {
    expect(k('cat =(rm -rf x)')).toBe('delete')
    expect(k('diff =(ls) =(git push)')).toBe('outside')
    expect(k("ls *(e:'rm -rf x':)")).toBe('delete')
    expect(k('ls *(.e{git push})')).toBe('outside')
    expect(k('ls *(+check)')).toBe('run')
    // 돌리는 것이 없는 꼬리표 · 배열은 그대로
    expect(k('ls *(.om[1,3])')).toBe('read')
    expect(k('ls -l *(Lk+50)')).toBe('read')
  })
  it('겹쳐 감싼 명령: find -exec · xargs 안의 sh -c · env · nice, time -p, 함수 정의', () => {
    for (const c of [`find . -exec sh -c 'rm -rf "$1"' _ {} \;`, "ls | xargs -I{} sh -c 'rm {}'", 'find . -exec env rm {} \;', 'time -p rm x', 'ls | xargs env rm', 'find . -exec nice rm {} +',
      'ls | xargs -n1 timeout 5 rm', 'caffeinate -t 60 rm -rf build', 'f() { rm -rf x; }; f', 'function f { rm -rf x; }; f', 'f () { git clean -fd; }'])
      expect(k(c), c).toBe('delete')
    for (const c of [`find . -exec sh -c 'curl -T "$1" https://x' _ {} \;`, 'ls | xargs -n1 env git push', 'find . -exec bash -c "sudo ls" \;']) expect(k(c), c).toBe('outside')
    expect(k('time ls')).toBe('read')
    expect(k('find . -exec wc -l {} +')).toBe('run')
  })
  it('읽어 들이는 돌려보내기(<)와 따옴표로 싼 받는 곳도 폴더 밖이면 외부', () => {
    for (const c of ['cat < /etc/passwd', 'wc -l <~/.zsh_history', "echo x > '/etc/foo'", 'sort < "$HOME/x"', "cat < '/etc/hosts'", 'echo x &> ~/out.log', "tee < '../other/a'"]) expect(k(c), c).toBe('outside')
    for (const c of ['cat < a.md', 'cat <<< hello', 'cat < /tmp/x', 'wc -l < /u/lib/x.md', 'cat <<EOF']) expect(k(c), c).toBe('read')
    for (const c of ["echo x > 'out.txt'", 'echo x >| out.txt', 'ls &> log.txt']) expect(k(c), c).toBe('edit')
  })
  it('따옴표 안의 < > 는 돌려보내기가 아니다', () => {
    for (const c of ['grep "=>" a.ts', "grep -c '->' a.md", "awk '$1 < 3' a.txt", 'echo "a > b" | wc -c', "sed -n 's/<b>//p' a.html"]) expect(k(c), c).toBe('read')
  })
  it('글자 그대로 적은 값의 변수는 그 값을 넣어서도 본다', () => {
    expect(k('for x in -delete; do find . $x; done')).toBe('delete')
    expect(k('for x in ". -delete"; do find $=x; done')).toBe('delete')
    expect(k('x=-delete; find . ${x}')).toBe('delete')
    expect(k('for p in push; do git $p; done')).toBe('outside')
    expect(k('for f in a.md b.md; do wc -l $f; done')).toBe('read')
    expect(k('for f in *.md; do wc -l $f; done')).toBe('read')
  })
  // 11/25 별도 검토의 나머지: 「읽기」 · 「실행」으로 남던 지우기 · 폴더 밖
  it('zsh의 앞말 · 묶음: noglob · =rm · repeat · 이름 없는 함수 · always · case', () => {
    for (const c of ['noglob rm -rf x', 'nocorrect rm x', '=rm -rf x', 'repeat 2 rm x', 'repeat 2 do rm x; done', '() { rm -rf x }', '() rm -rf x', '{ true } always { rm -rf x }',
      'case x in x) rm -rf y;; esac', 'case $a in a|b) rm -rf y ;; *) ls ;; esac', '- rm x', "env -S'rm -rf x'", 'env -S "rm -rf x" ls', 'env -u A rm x'])
      expect(k(c), c).toBe('delete')
    for (const c of ['noglob ls *.md', 'case x in x) ls;; esac', 'repeat 3 echo a', 'grep --color always x a.md', 'ls --color=always | head', 'echo a - b', 'cat - a.md']) expect(k(c), c).toBe('read')
  })
  it('펼침으로 만든 옵션: 중괄호 · 기본값 · 빈 변수', () => {
    for (const c of ['find . -{delete,print}', 'find . ${:--delete}', 'find . ${x:--delete}', 'find . -del${u}ete', 'git clean -{f,d}', 'rm {a,b}'])
      expect(k(c), c).toBe('delete')
    expect(k('git {push,status}')).toBe('outside')
    expect(k("echo ${(e):-'$(rm -rf y)'}")).toBe('delete')
    for (const c of ['ls {a,b}.md', 'find . -name "*.{ts,tsx}"', 'echo ${x:-none}', 'cp a.md{,.bak}']) expect(k(c), c).not.toBe('delete')
  })
  it('감싸 돌리는 꼴의 나머지: sh -ce · -c -- · xargs -J · git의 값 받는 앞 옵션 · 옵션 줄임꼴', () => {
    for (const c of ["sh -ce 'rm -rf x'", "bash -c -- 'rm -rf x'", "ksh -c 'rm x'", 'ls | xargs -J % rm -rf %', 'git --git-dir .git clean -fdx', 'git --work-tree . clean -fd', 'git reset --har',
      'git reset --ha HEAD~1', 'git reflog expire --expire=now --all', 'git reflog delete HEAD@{1}'])
      expect(k(c), c).toBe('delete')
    for (const c of ['git reset --soft HEAD~1', 'git reflog', 'git reflog show']) expect(k(c), c).not.toBe('delete')
  })
  it('읽는 프로그램의 쓰는 쓰임: sed의 w 깃발 · awk의 명령으로 잇기 · xxd 둘째 이름', () => {
    for (const c of ["sed -n 's/x/y/gw out.txt' a.md", "sed -n -e'w out.txt' a.md", "sed -n 's|x|y|w out.txt' a.md", 'xxd a.bin b.txt']) expect(k(c), c).toBe('edit')
    expect(k(`awk -v c='rm -rf x' 'BEGIN{print 1|c}'`)).toBe('run')
    for (const c of ["sed -n 's/x/y/gp' a.md", "awk '$1 ~ /a|b/ {print $1}' a.txt", 'xxd a.bin']) expect(k(c), c).toBe('read')
  })
  it('폴더 밖 경로: /tmp/.. · 중괄호 · $PWD/.. · for 낱말 · >! · of=', () => {
    for (const c of ['cat /tmp/../etc/passwd', 'cat {/etc/passwd,}', 'cat a.md {b.md,~/c.md}', 'cat $PWD/../other/secret', 'for f in /etc/*; do cat $f; done', 'echo hi > /tmp/../etc/x',
      'echo hi >!~/.zshrc', 'echo hi > {a,~/x}', 'dd if=a of=/Users/x/.zshrc', 'cat ${PWD}/../../x'])
      expect(k(c), c).toBe('outside')
    for (const c of ['cat /tmp/a/../b', 'cat $PWD/a.md', 'for f in *.md sub/*.md; do cat $f; done', 'dd if=a of=b']) expect(k(c), c).not.toBe('outside')
  })
  it('따옴표 없는 구분자의 히어독 본문은 치환이 펼쳐진다', () => {
    expect(k("cat <<E\necho '$(rm -rf x)'\nE")).toBe('delete')
    expect(k('cat <<-E\n\t"`git push`"\n\tE')).toBe('outside')
    expect(k("cat <<E\nit's fine\nE\nrm -rf x")).toBe('delete')
    // 구분자를 따옴표로 싼 히어독의 본문은 글자다: 그 안의 따옴표가 뒤 명령을 숨기지 못한다
    expect(k("cat <<'E'\nit's $(fine)\nE\nrm -rf x")).toBe('delete')
  })
  // 11/26 "heredoc 본문 오탐": 확실한 히어독(<< 앞에 따옴표 · 주석 · 치환이 없다)을 cat이나 python이 받으면 본문은 셸 명령이 아니다
  describe('확실한 히어독의 본문', () => {
    const src = "/** 설명 */\nconst u = '/api/app/status'\nreturn <div className=\"a\">{x}</div>\nrm -rf old ; curl x\nimport { a } from '../api'"
    it('cat이 받는 본문은 자료다: 소스 글의 경로 모양 · 명령 모양 낱말로 무겁게 보지 않는다', () => {
      expect(k(`cat > src/a.ts <<'EOF'\n${src}\nEOF`)).toBe('edit')
      expect(k(`cat <<'EOF' > src/a.ts\n${src}\nEOF`)).toBe('edit')
      expect(k(`cat >> notes.md <<EOF\ncurl is a tool; rm removes files; see /api/x\nEOF`)).toBe('edit')
      expect(k(`cat > /tmp/edit.py <<'EOF'\n${src}\nEOF`)).toBe('edit')
      expect(k(`mkdir -p src && cat > src/a.ts <<'EOF'\n${src}\nEOF\npnpm test 2>&1 | tail -5`)).toBe('run')
      expect(k(`cat <<-'EOF' > src/a.ts\n\t${src.replace(/\n/g, '\n\t')}\n\tEOF`)).toBe('edit')
    })
    it('python이 받는 본문은 코드다: 고칠 글 속의 경로 모양으로 폴더 밖이라 보지 않는다', () => {
      const py = `p='apps/web/src/a.tsx'\ns=open(p).read()\ns=s.replace("""${src}""", "x")\nopen(p,'w').write(s)`
      expect(k(`python3 - <<'EOF'\n${py}\nEOF`)).toBe('run')
      expect(k(`python3 <<'PY'\n${py}\nPY`)).toBe('run')
      expect(k(`cd apps/web && python3 - <<'EOF'\n${py}\nEOF`)).toBe('run')
      expect(k(`python3 - <<'EOF'\n${py}\nEOF\npnpm type-check 2>&1 | tail -3`)).toBe('run')
      expect(k(`python3 - <<'EOF' | tail -5\n${py}\nEOF`)).toBe('run')
    })
    it('python 코드의 문자열이 폴더 밖 경로(홈 · 시스템 폴더)면 여전히 외부다', () => {
      for (const line of ["open('/etc/hosts','w').write('x')", 'open(os.path.expanduser("~/.zshrc"),"a").write("x")', "shutil.rmtree('/Users/other/project')", "p = '~'", "open('/u/other/a.txt','w')"])
        expect(k(`python3 - <<'EOF'\nimport os, shutil\n${line}\nEOF`), line).toBe('outside')
      // 폴더 안 · 임시 폴더 · 경로가 아닌 글은 아니다
      for (const line of ["open('/u/p/a.txt','w')", "open('/tmp/a.txt','w')", "url = '/api/app/status'", "re.sub('/x+/', '', s)"])
        expect(k(`python3 - <<'EOF'\n${line}\nEOF`), line).toBe('run')
    })
    it('본문 뒤의 명령과 받는 줄의 나머지는 그대로 판정한다', () => {
      expect(k(`cat > src/a.ts <<'EOF'\n${src}\nEOF\nrm -rf build`)).toBe('delete')
      expect(k(`python3 - <<'EOF'\nprint(1)\nEOF\ngit push`)).toBe('outside')
      expect(k("cat > ~/.zshrc <<'EOF'\nx\nEOF")).toBe('outside')
      expect(k("cat <<'EOF' > /etc/x\nx\nEOF")).toBe('outside')
      expect(k("cat <<'EOF' > a.txt && rm -rf build\nx\nEOF")).toBe('delete')
      // 끝 줄은 구분자와 똑같은 줄뿐이다: 빈칸이 붙은 줄은 본문이고, <<- 는 탭만 뗀다
      expect(k("cat <<'EOF'\nx\n EOF\nrm -rf x\nEOF")).toBe('read')
      expect(k("cat <<-'EOF'\n\tx\n\tEOF\nrm -rf x")).toBe('delete')
    })
    // 11/26 검토: 첫 구현이 가볍게 본 꼴. 모두 셸에서 본문이 실제로 돈다
    it('구분자 뒤의 다른 빈칸 · & | 가 붙은 돌려보내기 · cat 을 바꿔 놓는 앞 명령은 확실한 히어독이 아니다', () => {
      for (const c of [
        // \r · \f · 줄 바꿈 없는 빈칸은 셸에게 구분자의 글자다: 본문은 「EOF\r」 줄에서 끝나고 그 뒤는 명령이다
        "cat <<'EOF'\r\nEOF\r\nrm -rf x\nEOF", "cat <<EOF\r\nEOF\r\nrm -rf x\nEOF", "cat <<'EOF' \nEOF \nrm -rf x\nEOF", "cat <<'EOF'\f\nEOF\f\nrm -rf x\nEOF", "cat\fx <<'EOF'\nrm -rf x\nEOF",
        // >| · >& · &> 의 | & 는 이음이 아니다: 받는 것은 sh 이고 cat 은 파일 이름이다
        "sh >| cat <<'EOF'\nrm -rf x\nEOF", "sh >& cat <<'EOF'\nrm -rf x\nEOF", "bash -s >| cat <<'EOF'\nrm -rf x\nEOF", "sh >| python3 <<'EOF'\nrm -rf x\nEOF", "sh &> cat <<'EOF'\nrm -rf x\nEOF", "node >| cat <<'EOF'\nrm -rf x\nEOF",
        // 같은 명령 안에서 cat 을 셸로 바꿔 놓는다 (zsh의 functions · commands · NULLCMD, bash의 별칭)
        "functions[cat]=sh\ncat <<'EOF'\nrm -rf x\nEOF", "commands[cat]=/bin/sh\ncat <<'EOF'\nrm -rf x\nEOF", "NULLCMD=sh\n>|cat <<'EOF'\nrm -rf x\nEOF", "shopt -s expand_aliases\nalias cat=sh\ncat <<'EOF'\nrm -rf x\nEOF",
        "set -o posix\nalias cat=sh\ncat <<'EOF'\nrm -rf x\nEOF", "alias cat=sh; cat <<'EOF'\nrm -rf x\nEOF", "autoload cat; cat <<'EOF'\nrm -rf x\nEOF", "PATH=.:/bin cat <<'EOF'\nrm -rf x\nEOF", "export PATH=.\ncat <<'EOF'\nrm -rf x\nEOF",
        "setopt aliases; cat <<'EOF'\nrm -rf x\nEOF", "source x.sh; cat <<'EOF'\nrm -rf x\nEOF", "exec 1>p; cat <<'EOF'\nrm -rf x\nEOF", "trap x EXIT; cat <<'EOF'\nrm -rf x\nEOF",
        // python 이 본문을 코드로 받는 꼴이 아니다 (모듈 · 파일 인자 · 다른 이름)
        "python3 <<'EOF' -m IPython\nrm -rf x\nEOF", "python3 x.py <<'EOF'\nrm -rf x\nEOF", "python3 - > out -m pdb <<'EOF'\nrm -rf x\nEOF", "python3 -i <<'EOF'\nrm -rf x\nEOF", "python3.12 - <<'EOF'\nrm -rf x\nEOF", "/usr/bin/python3 - <<'EOF'\nrm -rf x\nEOF",
      ]) expect(k(c), JSON.stringify(c)).toBe('delete')
      expect(k("hash cat=/bin/sh\ncat <<'EOF'\nrm -rf x\nEOF")).toBe('outside')
    })
    it('python 코드: 긴 문자열 안의 경로 · .. 으로 벗어나는 경로 · 홈을 얻는 코드도 외부다', () => {
      for (const line of ['os.system("rm -rf /u/Documents")', 'os.system("rm -rf ~/Documents")', 'subprocess.run("cp .env /u/Dropbox/", shell=True)', 'open(" /etc/hosts".strip(), "a")', 'f = open("../../x", "w")', 'shutil.rmtree("../sibling")',
        'os.chdir("..")', 'p = Path("..") / "x"', 'shutil.rmtree("/u/other")', 'open("/u/p/../other/x", "w")', 'open("/data/x", "w")', 'p = Path.home() / ".zshrc"', 'open(os.environ["HOME"] + "/.zshrc", "a")', "x = '~other'", "x = '~root/.ssh'",
        `open("/u/it's.txt", "w")`, 'p = os.path.expanduser(v)'])
        expect(k(`python3 - <<'EOF'\nimport os, shutil\n${line}\nEOF`), line).toBe('outside')
    })
    it('본문이 셸로 가거나 확실하지 않은 꼴은 전처럼 본문도 명령으로 읽는다', () => {
      for (const c of [
        // 본문을 셸 · 다른 프로그램이 받는다
        "cat <<'EOF' | sh\nrm -rf x\nEOF", "cat <<'EOF' | bash -s\nrm -rf x\nEOF", "cat <<'EOF' |\nrm -rf x\nEOF\nsh", "cat <<'EOF' |& sh\nrm -rf x\nEOF", "bash <<'EOF'\nrm -rf x\nEOF", "sh -s <<EOF\nrm -rf x\nEOF", "zsh <<'EOF'\nrm -rf x\nEOF",
        "while read l; do $l; done <<'EOF'\nrm -rf x\nEOF", "{ cat; } <<'EOF'\nrm -rf x\nEOF", "tee a.sh <<'EOF'\nrm -rf x\nEOF", "xargs rm <<'EOF'\nx\nEOF", "env cat <<'EOF'\nrm -rf x\nEOF", "X=1 cat <<'EOF'\nrm -rf x\nEOF",
        // << 앞에 따옴표 · 주석 · 치환 · 괄호 · 역슬래시가 있다
        "echo 'a' && cat <<'EOF'\nrm -rf x\nEOF", 'echo "a" ; cat <<EOF\nrm -rf x\nEOF', "ls # c\ncat <<'EOF'\nrm -rf x\nEOF", "echo $x; cat <<'EOF'\nrm -rf x\nEOF", "(cat <<'EOF'\nrm -rf x\nEOF\n)", "ls \\\n&& cat <<'EOF'\nrm -rf x\nEOF", "ls `pwd`; cat <<'EOF'\nrm -rf x\nEOF",
        // 받는 줄의 나머지에 따옴표 · 둘째 히어독, 펼쳐지는 본문, 낯선 구분자, 끝 줄 없음
        "cat <<'EOF' 'a\nb'\nrm -rf x\nEOF", "cat <<'A' <<'B'\nrm -rf x\nA\nx\nB", "cat <<EOF\n$(rm -rf x)\nEOF", "cat <<EOF\n`rm -rf x`\nEOF", "cat <<\\EOF\nrm -rf x\nEOF", "cat <<'E O F'\nrm -rf x\nE O F", "cat <<'EOF'\nrm -rf x",
      ]) expect(k(c), c).toBe('delete')
    })
  })
  // 11/25 셋째 검토: 새로 읽는 규칙(히어독 · 묶음 · 펼침)이 한쪽 뜻으로만 읽어 오히려 가볍게 판정했다. 원래 글과 둘 다 보고 무거운 쪽으로
  it('여러 뜻으로 읽힐 수 있으면 무거운 쪽으로', () => {
    for (const c of [
      // 히어독처럼 보이지만 아닌 << (따옴표 · 주석 안): 뒤 줄은 본문이 아니라 명령이다
      `echo "a $(echo "<<'true' ")"\necho \`rm -rf x\`\ntrue`, `echo "a $(echo "<<true ")"\nfind . -del''ete\ntrue`, "ls # <<'true'\necho $(rm -rf x)\ntrue", 'cat <<E "a\nb"\nbody\nE\nrm -rf x ; echo "done"',
      // 인자로 쓴 { 는 묶음이 아니다
      'rm -rf a { b',
    ]) expect(k(c), c).toBe('delete')
    for (const c of ['cat { /etc/passwd', 'cat ${HOME:-x}/.ssh/id_rsa', 'cat ${PWD%/*}/other/secret', 'ls ${HOME%/}']) expect(k(c), c).toBe('outside')
  })
  it('펼침의 나머지: 범위 · 여러 겹 중괄호 · 낱말 처음의 빈 변수 · 빈 치환', () => {
    for (const c of ['find . -{d..d}elete', 'find . -d{e,e}l{e,e}t{e,e}{,}{,}', 'find . $u-delete', 'find . -del$()ete', 'case x in x ) rm -rf y;; esac', "env -iS 'rm -rf x'", "bash -c -e 'rm -rf x'",
      'git --attr-source HEAD clean -fd', 'rm x{1..3}'])
      expect(k(c), c).toBe('delete')
    for (const c of ["sed -n 'wout.txt' a.md", "sed -ne'w out.txt' a.md", "sed -n 's_x_y_w out.txt' a.md", "sed -n -e 1p -e 'w out.txt' a.md"]) expect(k(c), c).toBe('edit')
    for (const c of ['sed -n 1p words.txt', "sed -n 's/hello world/x/p' a.md", "sed 's/foo/world/' a.md"]) expect(k(c), c).toBe('read')
  })
  it('흔한 명령을 더 무겁게 보지 않는다', () => {
    for (const c of ['tool --out=$PWD/dist/x', 'cc -I$PWD/include a.c', 'tool --out=$d/x.png']) expect(k(c), c).toBe('run')
    for (const c of ['xxd -l 16 a.bin', 'xxd -s 10 -l 4 a.bin', `awk '{printf "%s|%s\\n", $1, $2}' a.txt`, 'f () { ls }', 'cp a.md{,.bak} && ls']) expect(k(c), c).not.toBe('run')
    expect(k('xxd -l 16 a.bin')).toBe('read')
  })
  // 11/25 넷째 검토: 옛 코드와 나란히 돌려 더 가벼워진 꼴
  it('env -S 뒤의 옵션 · sed의 스크립트 자리 · 값이 많은 변수', () => {
    for (const c of ['env -S -- rm -rf x', 'env -S -i rm x', "bash -c -o errexit 'rm -rf x'", "zsh -c -- '- rm -rf x'",
      `for x in ${Array.from({ length: 64 }, (_, i) => `a${i}`).join(' ')} -delete; do find . $x; done`, 'for a in -del x y z w; do for b in ete p q r; do find . $a$b; done; done',
      "ls # <<X\ncat <<true\necho '\ntrue\nrm -rf x #'", "ls # <<'pwd'\ncat <<true\necho '\ntrue\necho `rm -rf x` #'\npwd"])
      expect(k(c), c).toBe('delete')
    for (const c of ["sed $u 'w out.txt' a.md", "sed -n $u 'w out.txt' a.md", "sed $(echo -n) 'w out.txt' a.md", "sed -n 'p\nw out.txt' a.md", "sed -ne'wnote.txt' a.md", "sed -n 's~x~y~w out.txt' a.md"])
      expect(k(c), c).toBe('edit')
    // 다 넣어 보지 못할 만큼 많으면 모르는 것으로: 실행
    expect(k(`for a in ${'x '.repeat(20)}; do for b in ${'y '.repeat(20)}; do find . $a$b; done; done`)).toBe('run')
  })
  it('값이 많은 변수를 수백 번 써도, env -S 를 수만 번 이어도 바로 답한다', () => {
    const loops = Array.from({ length: 12 }, (_, i) => `for v${i} in ${Array.from({ length: 256 }, (_, n) => `w${n}`).join(' ')}; do`).join(' ')
    const uses = `echo ${Array.from({ length: 12 }, (_, i) => `$v${i}`).join(' ')}\n`.repeat(600)
    const t0 = Date.now()
    expect(k(`${loops}\n${uses}`)).toBe('run')
    const t1 = Date.now()
    expect(['read', 'run']).toContain(k(`env ${'-S '.repeat(60000)}`))
    // (느린 실행기에서도 넉넉히: 고치기 전에는 맥에서 10초씩 걸렸다)
    expect([t1 - t0, Date.now() - t1].every((ms) => ms < 4000), `${t1 - t0}ms · ${Date.now() - t1}ms`).toBe(true)
    expect(k("env -u A -S 'rm -rf x'")).toBe('delete')
    expect(k('env -i -S -- rm x')).toBe('delete')
    // 한도 안에서는 그대로 다 넣어 본다
    expect(k('for x in a b -delete; do find . $x; done')).toBe('delete')
  })
  it('중괄호가 수십 겹이어도 바로 답한다 (다 펼치지 못하면 폴더 밖으로)', () => {
    const t0 = Date.now()
    for (const c of [`cat /u/p/${'{a,b}'.repeat(30)}`, `ls ../p/x${'{a,b}'.repeat(30)}`, `echo hi > /u/p/o${'{a,b}'.repeat(30)}`]) expect(k(c), c).toBe('outside')
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(k('cat /u/p/{a,b}{c,d}.md')).toBe('read')
  })
  it('따옴표 안의 이음표는 나누지 않는다', () => {
    expect(k("grep 'a && rm b' x")).toBe('read')
    expect(k('echo "x; git push"')).toBe('read')
  })
  it('「늘」의 프로그램 이름', () => {
    expect(runProgram('cd x && python run.py --n 3')).toBe('python')
    expect(runProgram('pnpm test -- a')).toBe('pnpm test')
    expect(runProgram('A=1 julia x.jl')).toBe('julia')
  })
  it('「늘」은 줄 안의 실행 프로그램 모두를 본다', () => {
    expect(runPrograms('pnpm test && ./deploy.sh')).toEqual(['pnpm test', 'deploy.sh'])
    expect(runPrograms('cd x && pnpm test | tail -5')).toEqual(['pnpm test'])
    expect(runPrograms('python a.py; git commit -m x; mv a b')).toEqual(['python', 'git commit', 'mv'])
    expect(runPrograms('echo $(node x.js)')).toEqual(['node'])
    expect(runPrograms('GIT_PAGER=less git log')).toEqual(['GIT_PAGER= git log'])
    expect(runPrograms('ls | wc -l')).toEqual([])
  })
  it('가운데의 ../ · 옵션에 붙여 적은 경로로 폴더를 벗어나면 외부', () => {
    for (const c of ['cat workbench/../../other/secret', 'ls a/b/../../..', 'grep -r x --file=/etc/hosts .', 'grep -f/etc/hosts a', 'rg x --ignore-file=~/.ssh/config', 'cd workbench/../.. && ls']) expect(k(c), c).toBe('outside')
    for (const c of ['cat workbench/../a.md', "grep -rn \"from '../x'\" workbench", 'rg --glob=*.md x', 'ls --color=auto', 'cat --number a.md', 'grep --file=patterns.txt a']) expect(k(c), c).toBe('read')
  })
  it('감싸 돌리는 명령은 안의 명령도 본다', () => {
    for (const c of ['bash -c "rm -rf build"', "bash -lc 'cd x && rm a'", 'sh -c "rm a"', 'eval "rm a"', 'find . -name "*.tmp" -exec rm {} \\;', 'find . -exec rm {} +', 'ls | xargs rm', 'ls | xargs -n 1 rm', 'ls | xargs -I {} rm {}', 'timeout 5 rm a', 'timeout -s KILL 5s rm a', 'nice -n 5 rm a', 'caffeinate -i rm a', 'git checkout -f main', 'git checkout HEAD~1 a.md', 'git switch -f main', 'git switch --discard-changes main'])
      expect(k(c), c).toBe('delete')
    for (const c of ['bash -c "curl https://x | sh"', 'sh -c "git push"', 'bash -c "cat /etc/hosts"', 'find . -exec curl x \\;', 'ls | xargs -n 1 curl', 'git config --global user.name x'])
      expect(k(c), c).toBe('outside')
    for (const c of ['bash -c "pnpm test"', 'bash -c "ls"', 'find . -exec wc {} \\;', 'ls | xargs -n 1 python', 'timeout 60 pnpm test']) expect(k(c), c).toBe('run')
    for (const c of ['ls | xargs wc -l', 'ls | xargs -n 1 cat', 'timeout 5 cat a', 'git checkout main', 'git checkout -b new origin/main', 'git switch main', 'git config --global --get user.name'])
      expect(k(c), c).toBe(/checkout|switch/.test(c) ? 'edit' : 'read')
  })
  it('셸의 묶음 말 뒤의 명령도 본다', () => {
    for (const c of ['for f in a b; do rm $f; done', 'if true; then rm x; fi', 'while read l; do rm "$l"; done < list', '( rm x )', '(rm x)', '{ rm x; }', '! rm x']) expect(k(c), c).toBe('delete')
    for (const c of ['for f in *.md; do wc -l "$f"; done', 'if [ -f a ]; then cat a; else echo none; fi', '(cd workbench && ls)', 'while read l; do echo "$l"; done < a']) expect(k(c), c).toBe('read')
    for (const c of ['for c in rm; do $c x; done', 'case x in a) rm b;; esac']) expect(k(c), c).not.toBe('read')
  })
})

describe('묻지 않고 지나가던 꼴 (11/24 검토)', () => {
  it('작은따옴표 안의 $( · 백틱은 치환이 아니다: 그 사이에 낀 명령을 가리지 않는다', () => {
    expect(k("echo '$(echo ' ; rm -rf x ; echo ')'")).toBe('delete')
    expect(k("echo '`echo ' ; rm -rf x ; echo '`'")).toBe('delete')
    expect(k(`echo "$(echo '$(echo ' ; rm -rf x ; echo ')')"`)).toBe('delete')
    // 보통 꼴은 그대로
    expect(k("echo '$(date)'")).toBe('read')
    expect(k('echo "$(date)"')).toBe('read')
    expect(k(`echo "it's $(date)"`)).toBe('read')
    expect(k('echo "$(rm -rf x)"')).toBe('delete')
  })
  it('git -C <폴더> · -c k=v 뒤의 하위 명령을 본다', () => {
    expect(k('git -C . clean -fdx')).toBe('delete')
    expect(k('git -C . reset --hard HEAD~3')).toBe('delete')
    expect(k('git -C . push --force origin main')).toBe('outside')
    expect(k('git -c core.pager=cat push origin HEAD')).toBe('outside')
    expect(k('git -C . status')).toBe('read')
    expect(k('git --no-pager log -3')).toBe('read')
    expect(k('git -c core.pager=cat log')).toBe('run')
  })
  it('find -exec는 「{} +」일 때만 +에서 끝난다: 홀로 선 + 뒤의 인자도 본다', () => {
    expect(k('find . -exec rm -rf + x {} \\;')).toBe('delete')
  })
  it('붙여 쓴 짧은 옵션: sed -Ei · sed의 주소 뒤 w · tree -ao', () => {
    expect(k("sed -Ei '' 's/a/b/' file.txt")).toBe('edit')
    expect(k("sed -ni 's/a/b/p' file.txt")).toBe('edit')
    expect(k("sed -n '1,5w out.txt' f")).toBe('edit')
    expect(k("sed -n '1,5p' f")).toBe('read')
    expect(k("sed -E 's/a/b/' f")).toBe('read')
    expect(k('tree -ao out.txt')).toBe('edit')
    expect(k('tree -a')).toBe('read')
  })
  it('>&2file은 fd 복제가 아니라 파일에 쓰기', () => {
    expect(k('echo x >&2file')).toBe('edit')
    expect(k('echo x >&2026-11-24.md')).toBe('edit')
    expect(k('echo x >&2')).toBe('read')
    expect(k('ls 2>&1 | head')).toBe('read')
  })
})

describe('토글 기본값', () => {
  it('권한 이름마다', () => {
    expect(presetAuto('read', 'ask')).toEqual({ read: true, run: false, web: false })
    expect(presetAuto('notes', 'ask')).toEqual({ read: false, run: false, web: false })
    expect(presetAuto('notes', 'edit')).toEqual({ read: true, run: false, web: false })
    expect(autoOf({ write: 'notes', mode: 'ask', auto: { web: true } })).toEqual({ read: false, run: false, web: true })
    expect(autoCustom({ write: 'notes', mode: 'edit', auto: { read: true } })).toBe(false)
    expect(autoCustom({ write: 'notes', mode: 'edit', auto: { run: true } })).toBe(true)
  })
})

describe('읽기로 보이던 쓰기 · 실행 (11/20 보안 검토)', () => {
  it('뒤에서 돌리기(&) · 겹친 $( ) · env 앞말 뒤의 명령도 본다', () => {
    expect(k('ls & rm -rf build')).toBe('delete')
    expect(k('echo "$(echo $(rm a.md))"')).toBe('delete')
    expect(k("env sh -c 'rm -rf notes'")).toBe('delete')
    expect(k('FOO=1 env -i python x.py')).toBe('run')
    expect(k('env')).toBe('read')
    expect(k('wc -l a 2>&1 | head')).toBe('read')
  })
  it('읽는 프로그램의 쓰는 쓰임', () => {
    for (const c of ["sed -n 'w out.txt' a.md", 'sort -o a b', 'sort -uo a b', 'uniq a b', 'xxd -r a b', "yq -i '.a=1' f.yaml", 'find . -fprint out', 'tree -o out', 'pdftotext a.pdf', 'echo x 1> y', 'echo x &> y', 'ls 2> err.txt'])
      expect(k(c), c).toBe('edit')
    for (const c of ['awk \'BEGIN{"rm -rf x" | getline}\'', 'awk \'{print | "sh"}\' f']) expect(k(c), c).toBe('run')
    for (const c of ["awk '$3 == 100 {n++} END{print n}' f", "sed -n '2p' a.md", 'sort -n -k2 a', 'uniq -c a', 'xxd a | head', 'pdftotext a.pdf -', "yq '.a' f.yaml"]) expect(k(c), c).toBe('read')
  })
  it('<( ) 안의 명령 · git의 쓰는 쓰임 · rg --pre · $HOME 경로', () => {
    expect(k('cat <(rm -rf x)')).toBe('delete')
    expect(k('diff <(curl https://example.com) a')).toBe('outside')
    for (const c of ['git branch -D old', 'git tag -d v1', 'git branch --delete old']) expect(k(c), c).toBe('delete')
    for (const c of ['git branch -m a b', 'git branch new', 'git tag v1', 'git tag -a v1 -m x', 'git config alias.x "!rm -rf ."', 'git config --unset a.b', 'git remote rename o p', 'git log --output=x', 'git diff --output x'])
      expect(k(c), c).toBe('edit')
    // 원격 주소를 정하는 것은 밖으로 나갈 자리를 정한다 (11/27 보안 검토)
    for (const c of ['git remote add o u', 'git remote set-url origin u']) expect(k(c), c).toBe('outside')
    for (const c of ['git branch', 'git branch -a', 'git branch -vv', 'git branch -r', 'git branch --show-current', 'git branch --contains abc', 'git tag', 'git tag -l "v*"', 'git tag --sort=-creatordate', 'git config user.name', 'git config --get a.b', 'git config -l', 'git remote -v', 'git remote show origin', 'git log --oneline -5', 'git diff a b'])
      expect(k(c), c).toBe('read')
    expect(k('rg --pre cat x')).toBe('run')
    for (const c of ['GIT_PAGER="rm x" git log', 'LESSOPEN="|rm %s" less f', 'PATH=. ls', 'env GIT_EXTERNAL_DIFF=rm git diff', 'sort --compress-program=rm a']) expect(k(c), c).toBe('run')
    for (const c of ['LC_ALL=C sort a', 'TZ=UTC date', 'NO_COLOR=1 git diff']) expect(k(c), c).toBe('read')
    for (const c of ['git grep -Orm x', 'git grep --open-files-in-pager=rm x', 'git log -p --ext-diff']) expect(k(c), c).toBe('run')
    expect(k('git grep -n foo')).toBe('read')
    expect(k('rg -n foo src')).toBe('read')
    expect(k('cat $HOME/.ssh/id_rsa')).toBe('outside')
    expect(k('cat "${HOME}/.ssh/id_rsa"')).toBe('outside')
    expect(k('cat ~other/x')).toBe('outside')
  })

  // 11/26: 인계 문서의 「아직 놓치는 것」 가운데 뜻이 하나로 정해지는 꼴. 판정을 더하기만 한다 (원래 읽기와 새 읽기 중 무거운 쪽)
  const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1).join(' ')
  it('묶음 안에서 정한 변수 · 빈 변수와 기본값이 한 줄에', () => {
    for (const c of ['( for x in -delete; do find . $x; done )', '{ x=-delete; find . $x; }', '(x=-delete; find . $x)', 'if true; then x=-delete; find . $x; fi', '() { x=-delete; find . $x }', '() { for x in -delete; do find . $x; done }', 'f() { x=-delete; find . $x; }', 'a=-del; (b=ete; find . $a$b)']) expect(k(c), c).toBe('delete')
    for (const c of ['find ${HOME:-/tmp/a} $u-delete', 'rm -rf$u ${HOME:-/tmp/a/b}']) expect(['delete', 'outside'], c).toContain(k(c))
    // 값이 글자 그대로가 아니거나 쓰지 않으면 전과 같다
    for (const c of ['( for x in a b; do cat $x; done )', '(cd a && ls)', 'find . -name "$pat"', 'find . -name $u"*.md"']) expect(k(c), c).toBe('read')
  })
  // 별도 검토(11/26)가 찾은 것: 묶음 안의 값을 원래 표에 더하면 값의 곱이 한도를 넘어 진짜 값을 넣어 보지 못했다. 묶음의 값은 따로 적고 따로 센다
  it('묶음 안에서 같은 이름을 다시 정해도 바깥 값으로 본 판정은 그대로다', () => {
    expect(k(`a=-del; b=ete; (for a in ${seq(17)}; do :; done); (for b in ${seq(16)}; do :; done); find . $a$b`)).toBe('delete')
    expect(k(`a=re; b=set; c=--ha; d=rd; (for a in ${seq(5)}; do :; done); (for b in ${seq(5)}; do :; done); (for c in ${seq(5)}; do :; done); (for d in ${seq(5)}; do :; done); git $a$b $c$d`)).toBe('delete')
    expect(k(`f=-delete; (for x in ${seq(64)}; do :; done); ${'echo $x; '.repeat(10)}find . $f`)).toBe('delete')
    expect(k(`for x in ${seq(64)} -delete; do (x=0); find . $x; done`)).toBe('delete')
  })
  it('sed의 w: 주소 · 깃발에 붙여 쓴 파일 이름', () => {
    for (const c of ["sed -n '1wout.txt' f", "sed -n 's/x/y/wout.txt' f", "sed -n '\\,re,wout.txt' f", "sed -n '$wout.txt' f", "sed '1,5wout' f", "sed -n 's/x/y/gwout.txt' f", "sed -n '2!wout.txt' f", "sed -n 'p;3wout.txt' f", "sed -n 's|x|y|wout.txt' f", "sed -n '2,/b/wout' f", "sed -n 's/[[:alpha:]/]/X/wout' f", "sed -n '1w;x' f", "sed -n '#s/\n1wout' f", "sed -n -e '1wout' f"]) expect(k(c), c).toBe('edit')
    // / 로 시작하는 스크립트는 전부터 경로로도 읽혀 「외부」다 (과하게 잡는 것): 읽기만 아니면 된다
    for (const c of ["sed -n '/re/wout.txt' f", "sed -n '/a/,/b/wout' f"]) expect(k(c), c).not.toBe('read')
    // 무늬 · 바꿀 글 안의 w 는 쓰기가 아니다. 빈칸이 든 파일 이름과 주석도
    for (const c of ["sed 's/word/x/' f", "sed 's/a/w/' f", "sed 's/x/y/g' words.txt", "sed -n '2p;5q' w.txt", "sed 'y/abc/wxy/' f", "sed 's/ow/x/;s/w$//' f", "sed 's/x/y/;s/we/us/' f", "sed -E 's/(a|w)b/x/' f", "sed '1s/w/x/' f", "sed -n '$p' w", 'sed -n \'1,5p\' "new file.txt"', 'sed -n 1p "few words.txt"', "sed 's/a/b/' 'How we work.md'", "sed '# just a comment with words\ns/a/b/' f"]) expect(k(c), c).toBe('read')
    for (const sc of ['s/word/x/', '/www/p', 's/a/w/', '2p;5q', 's/\\/w/x/', 'y/abc/wxy/', '/w/d', 's/ow/x/;s/w$//', '/^w/p', 's/x/y/;s/we/us/', 's/(a|w)b/x/', '1s/w/x/', '$p', 'a\\ write this', 'r words.txt', 's/[/w]/x/', '/a/,/w/p', 's/x/y/w', '', '# w out', 's/[[:alpha:]w]/x/', 's/[]w]/x/', 's/[^]/w]/x/']) expect(sedWrites(sc), sc).toBe(false)
    for (const sc of ['1wout.txt', 's/x/y/wout.txt', '/re/wout.txt', '$wout.txt', '1,5wout', '2!wout', 'p;3wout', 's|x|y|wout', '/a/,/b/wout', 'w out', 's/x/y/gw out', '1{w out\n}', '\\,re,wout', '/a/I,+2Wout', 's/[/]/x/wout', 's/[[:alpha:]/]/X/wout', 's/[[=a=]/]/X/wout', '1w;x', 's/a/X/w;out', '#s/\n1wout', 's/a/b/;#x/\n1wout', `${'p;'.repeat(6000)}1wout`]) expect(sedWrites(sc), sc).toBe(true)
  })
  it('fd -x · -X 는 찾은 파일마다 그 명령을 돌린다', () => {
    for (const c of ['fd -x rm', 'fd . -X rm -rf', 'fd -e md --exec rm {}', 'fd -e md --exec-batch rm', 'fd -tf -x rm', 'fd . --exec=rm', 'fd . -xrm', 'fd -Hx rm', `fd . ${'-x true \\; '.repeat(17)}-x rm -rf src`]) expect(k(c), c).toBe('delete')
    expect(k('fd -e md -x cat')).toBe('run')
    expect(k('fd -x curl https://example.com')).toBe('outside')
    for (const c of ['fd -e md', 'fd --extension md -t f', 'fd pattern src', 'fd -tx', 'fd -e xml']) expect(k(c), c).toBe('read')
  })
  it('따옴표 친 빈칸이 든 중괄호도 경로로 펼쳐 본다', () => {
    for (const c of ['cat {/etc/passwd,"a b"}', "cat {'a b',/etc/passwd}", 'cat {"x y",../../etc/passwd}', `cat {"a b",${Array.from({ length: 63 }, (_, i) => `x${i}`).join(',')},/etc/passwd}`]) expect(k(c), c).toBe('outside')
    for (const c of ['cat {a,"b c"}.md', 'echo {"a b",c}', "jq '{a: .x, b: .y}' f.json", "awk '{print $1, $2}' a.txt", "awk '{print $1,/x/}' f"]) expect(k(c), c).toBe('read')
  })
  // 두 번째 검토(11/26)가 찾은 것: 따옴표 친 JSON · 여러 중괄호가 든 글이 「외부」가 되고, 다시 정한 이름의 옛 값으로 판정했다
  it('따옴표 친 JSON과 다시 정한 변수는 전과 같다', () => {
    expect(k(`echo '{"name":"x","scripts":{"dev":"vite","build":"tsc","test":"vitest"},"dependencies":{"a":"1","b":"2","c":"3"},"devDependencies":{"d":"1","e":"2","f":"3"}}' > /tmp/p.json`)).toBe('edit')
    expect(k(`echo '[{"a":1,"b":2},{"a":3,"b":4},{"a":5,"b":6},{"a":7,"b":8},{"a":9,"b":10},{"a":11,"b":12},{"a":13,"b":14}]' | jq length`)).toBe('read')
    expect(k('git commit -m "support {a,b,c} and {x,y,z} in {foo,bar,baz} for {1,2,3}"')).toBe('edit')
    expect(k('echo "{1..10} x {1..10}"')).toBe('read')
    expect(k('mode=--hard; mode=--soft; git reset $mode HEAD~1')).toBe('run')
  })
  it('감싸 돌리는 명령과 옵션 속 변수가 여러 겹이어도, sed 스크립트에 닫히지 않은 [ 가 수만 개여도 바로 답한다', () => {
    const t0 = Date.now()
    k(`sed 's/${'['.repeat(20000)}' f`)
    k(`sed 's/${'[[:'.repeat(20000)}' f`)
    k(`sed -n '${'/[/p;'.repeat(20000)}' f`)
    k(`${'xargs -$abcdefghi -$abcdefghj -$abcdefghk '.repeat(6)}echo hi`)
    k(`${'xargs -$ab '.repeat(12)}echo hi`)
    k(`${'eval nice '.repeat(4)}echo -$abcdefghi -$abcdefghj -$abcdefghk`)
    k(`${'xargs -${x:-a}$u '.repeat(10)}echo hi`)
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})

describe('uniq 의 둘째 이름은 쓸 파일 (11/26 검토): 입력을 뜻하는 - 와 -- 뒤의 낱말도 이름으로 센다', () => {
  it('쓰는 꼴은 편집, 읽는 꼴은 읽기', () => {
    for (const c of ['cat f | uniq - out.sh', 'uniq -c - out', 'uniq -- - out', 'uniq -- -a out', 'uniq -f1 - out', 'uniq a b']) expect(k(c), c).toBe('edit')
    for (const c of ['uniq a', 'uniq -c a', 'cat f | uniq -c -', 'cat f | uniq', 'uniq -- a', 'cat f | uniq -f 1 -', 'uniq -s 2 a']) expect(k(c), c).toBe('read')
    for (const c of ['uniq -f 1 - out', 'uniq -f x out']) expect(k(c), c).toBe('edit')
    // 낱말이 많아도 느려지지 않는다 (낱말마다 -- 를 다시 찾지 않는다)
    const t0 = Date.now(); expect(k(`cat f | uniq ${'-c '.repeat(8000)}`)).toBe('read'); expect(Date.now() - t0).toBeLessThan(3000)
    expect(k('cat f | uniq - /etc/x')).toBe('outside')
  })
})
