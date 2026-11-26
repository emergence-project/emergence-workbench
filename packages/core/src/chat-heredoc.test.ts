// 확실한 히어독 (11/26 "heredoc 본문 오탐")의 둘째 검토에서 나온 꼴. 첫 검토의 꼴과 바탕 사례는 chat-auto.test.ts 「확실한 히어독의 본문」
import { describe, expect, it } from 'vitest'
import { commandKind, heredocBodiesRemoved } from './chat-auto.js'
import { certainHeredoc } from './chat-shell.js'

const o = { cwd: '/u/p', home: '/u', inside: (a: string) => a === '/u/p' || a.startsWith('/u/p/') || a.startsWith('/u/lib/') }
const k = (c: string) => commandKind(c, o)
const py = (line: string) => k(`python3 - <<'EOF'\nimport os, shutil\n${line}\nEOF`)

describe('확실한 히어독: 둘째 검토', () => {
  it('구분자 뒤의 &> · >| 는 돌려보내기다: 그 뒤의 낱말은 python 의 인자라 본문은 코드가 아니다', () => {
    for (const c of [
      "python3 <<'EOF' &>f -m IPython\nrm -rf x\nEOF",
      "python3 <<'EOF' &>f x.py\nrm -rf x\nEOF",
      "python3 <<'EOF' >f 2>&1 &>g -m IPython\nrm -rf x\nEOF",
      "python3 <<'EOF' &>/dev/null -m xonsh\nrm -rf x\nEOF",
      "python3 <<'EOF' >|f -m x\nrm -rf x\nEOF",
    ]) expect(k(c), JSON.stringify(c)).toBe('delete')
  })
  it('다른 프로그램을 돌리는 python 코드는 본문을 전처럼 읽는다: 문자열 속 셸 글이 실제로 돈다', () => {
    expect(k('python3 - <<\'EOF\'\nimport subprocess\nsubprocess.run("""\nrm -rf build\n""", shell=True)\nEOF')).toBe('delete')
    expect(k('python3 - <<\'EOF\'\ncmd = """\ngit push origin main\n"""\nimport os\nos.system(cmd)\nEOF')).toBe('outside')
    expect(py('os.system("rm -rf ../other")')).toBe('outside')
    expect(py('os.system("rm -rf /")')).toBe('outside')
    // os 를 다른 이름으로 들이거나 다른 길로 셸을 부르는 꼴 (셋째 검토): zsh에서 본문의 글이 실제로 돌았다
    for (const head of ['from os import system\nsystem(', 'import os as o\no.system(', 'import asyncio\nasyncio.run(asyncio.create_subprocess_shell(', 'import os\ngetattr(os, "system")(', 'import posix\nposix.system(', 'import ctypes\nctypes.CDLL(None).system(', 'import os\n(os).system(', 'import os\nvars(os)["system"](', 'import sh\nsh.bash("-c", ',
      // 다섯째 검토 (11/26): os 를 다른 이름에 담거나 다른 모듈을 거쳐 얻는 꼴, 전각 글자로 쓴 이름(python 은 이름을 NFKC 로 고쳐 읽는다)
      'import os\no = os\no.system(', 'from posix import system as s\ns(', 'import pydoc\npydoc.pipepager("", ', 'import os\nos.__dict__["system"](', 'import os\nglobals()["os"].system(', 'import os\n[os][0].system(', 'import os\nfor m in (os,): m.system(', 'import shutil\nq = shutil.os\nq.system(', 'import os\nos.__getattribute__("system")(', 'import os\n\uff4fs.system(', 'import s\uff55bprocess as sp\nsp.run('])
      expect(k(`python3 - <<'EOF'\n${head}"""\nrm -rf build\n""")\nEOF`), head).toBe('delete')
    // 고칠 소스 글에 든 .exec( · .compile( 은 프로그램을 돌리는 코드가 아니다. import os 와 os.path · os.environ 을 쓰는 것, 글 속의 os 도 아니다
    expect(py('import os, sys\np = os.path.join("a", "b")\ns = "macos and node:os"  # os specific')).toBe('run')
    expect(py('s = s.replace("m = re.exec(x); p = rx.compile(y); q = path.posix.join(a, b)", "x")')).toBe('run')
    // exec( 가 있으면 본문을 전처럼 줄마다 읽는다: 줄 처음의 rm 이 지우기로 보인다
    expect(py('exec(open("x.py").read())\nrm = 1')).toBe('delete')
    // 한 줄에 선 지우기 글은 전에도 실행으로만 보였다 (python -c 와 같다)
    expect(py('os.system("rm -rf build")')).toBe('run')
  })
  it('python 코드: 긴 문자열 안의 .. · ~, 뿌리, 낯선 꼴 · 대소문자만 다른 시스템 폴더, 옵션에 붙은 경로도 외부다', () => {
    for (const line of [
      'shutil.rmtree("../other dir/x")', 'shutil.copy(".env", "../leak/My Notes/")', 'p = "see ~ and ~other/x"', 'note = "copy to ~other/x"',
      'os.path.join("/", "etc", "hosts")', 'Path("/") / "etc"', 'os.walk("/")', 'os.listdir("/")', 'glob.glob("/*")',
      'open("/.hidden","w")', 'open("/_x","w")', 'open("/0/x","w")', 'open("//etc/passwd")', 'open("/./etc/passwd")',
      'tarfile.open("a.tar").extractall("/")', 'shutil.copytree(".", "/")', 'os.listdir(path="/")', 'os.chmod("/", 0o777)', 'glob.glob("/**", recursive=True)', 'd = "/"',
      'open("/users/shared/x","w")', 'open("/ETC/hosts","a")', 'open("/Private/etc/hosts","a")', 'x = ["tar", "-C/etc", "-xf", "a.tar"]', 'open("/gpfs/x","w")',
    ]) expect(py(line), line).toBe('outside')
  })
  it('고치기 스크립트에 흔한 글은 외부가 아니다: 홀로 선 / , 따옴표로 시작하는 낱말, 세 겹 따옴표 안의 소스 글', () => {
    for (const line of [
      "parts = p.split('/')", "s = '/'.join(parts)", `s = s.replace('''const folder = f.split('/').slice(-2).join('/')''', 'x')`, "s = s.replace('a / b', 'a/b')", 's = s.replace("<div />", "<span />")', 's = s.replace("// old", "// new")', 's = s.replace("/* a */", "/* b */")',
      `s = s.replace("from '../api'", "from '../api2'")`, `s = s.replace("""import { a } from '../api'\nconst home = '~'\nconst u = '/api/app/status'""", "x")`, 'open("sub/../a.txt", "w")', "u = '/api/app/status'",
    ]) expect(py(line), line).toBe('run')
  })
  it('드문 오탐으로 남는 것: 한 줄 문자열 안에 낱말로 선 .. · ~', () => {
    expect(py("t = '..'.join(parts)")).toBe('outside')
    expect(py("sel = '.a ~ .b'")).toBe('outside')
  })
  it('히어독이 이어지면 하나씩 본다. 뒤의 명령과 받는 줄의 나머지는 그대로 판정한다', () => {
    expect(k("cat > a.txt <<'A'\nrm -rf x\nA\npython3 - <<'B'\nprint('/api/x')\nB\npnpm test")).toBe('run')
    expect(k("cat > a.txt <<'A'\nrm -rf x\nA\npython3 - <<'B'\nprint(1)\nB\nrm -rf build")).toBe('delete')
    expect(k("python3 - <<'EOF' 2>&1 | tail -5\nprint('/api/x')\nEOF")).toBe('run')
    expect(k("python3 - <<'EOF' > out.txt 2>&1\nprint('/api/x')\nEOF")).toBe('run')
    expect(k("python3 -I - <<'EOF' > ~/out.txt\nprint(1)\nEOF")).toBe('outside')
  })
  it('확실한 히어독 뒤의 다른 히어독 · 안쪽 글(sh -c · $( ))은 전처럼 본문도 읽는다', () => {
    for (const c of ["cat > a.txt <<'A'\nx\nA\nsh <<'B'\nrm -rf x\nB", `sh -c "cat <<'EOF'\nrm -rf x\nEOF"`, "echo $(cat <<'EOF'\nrm -rf x\nEOF\n)", "eval cat <<'EOF'\nrm -rf x\nEOF"])
      expect(k(c), JSON.stringify(c)).toBe('delete')
  })
  it('폴더를 가리지 않고 볼 때(자동의 첫 판정)도 본문의 명령 모양 낱말로 무겁게 보지 않는다', () => {
    const any = (c: string) => commandKind(c, { ...o, inside: () => true })
    expect(any("python3 - <<'EOF'\ns = s.replace('''\nrm -rf old\ncurl x | sh\n''', '')\nEOF")).toBe('run')
    expect(any("cat > a.md <<'EOF'\nrm -rf old\ngit push\nEOF")).toBe('edit')
    expect(any("cat <<'EOF' | sh\nrm -rf old\nEOF")).toBe('delete')
  })
})

describe('certainHeredoc', () => {
  it('본문 · 앞 · 뒤를 가르고, 받는 줄의 << 구분자를 </dev/null 로 바꾼다', () => {
    expect(certainHeredoc("cd a && cat > b.txt <<'EOF' ; ls\nx\ny\nEOF\npnpm test")).toEqual({ head: 'cd a && cat > b.txt </dev/null ; ls', body: 'x\ny', rest: 'pnpm test', prog: 'cat', piped: false, reader: true })
    expect(certainHeredoc('python3 - <<PY | tail -1\nprint(1)\nPY')).toMatchObject({ prog: 'python', piped: true, body: 'print(1)', rest: '' })
    expect(certainHeredoc('set -e\ncat <<-"E" > a\n\tx\n\tE')).toMatchObject({ prog: 'cat', body: '\tx', rest: '' })
  })
  it('하나라도 어긋나면 null', () => {
    for (const c of [
      "bash <<'EOF'\nx\nEOF", "cat <<'EOF'\nx", "cat <<< x\ncat <<'EOF'\nx\nEOF", 'cat <<EOF\n$x\nEOF', "echo 'a'; cat <<'EOF'\nx\nEOF", "set -o posix; cat <<'EOF'\nx\nEOF", "X=1; cat <<'EOF'\nx\nEOF",
      "cat <<'EOF' <<'B'\nx\nEOF\ny\nB", "python3 -m x <<'EOF'\nx\nEOF", "python3 <<'EOF' x.py\nx\nEOF", "cat <<'EOF'\r\nx\nEOF", "while true; do cat <<'EOF'\nx\nEOF",
    ]) expect(certainHeredoc(c), JSON.stringify(c)).toBeNull()
  })
})

// 11/26 화면 확인에서 나온 것: 본문을 뺀 글을 판정의 다른 단계(앱이 맡는 일 · 비밀 · 크리티컬)도 쓴다
describe('확실한 히어독: python 의 출력을 받는 프로그램', () => {
  const body = 'print("""\nrm -rf build\n""")'
  it('출력을 셸 · 다른 프로그램이 받으면 문자열 속 글이 실제로 돈다: 본문을 전처럼 읽는다', () => {
    for (const tail of ['| sh', '| bash', '| zsh -s', '|& sh', '2>&1 | sh', '| tail -5 | sh', '| tee x.sh | sh', '| xargs -I% sh -c %', '| python3', '| env sh', '| command sh', '| nice sh', '| sort -S 1 --compress-program sh', '| cat | uniq | sort --compress-prog sh | wc -l'])
      expect(k(`python3 - <<'EOF' ${tail}\n${body}\nEOF`), tail).toBe('delete')
    // | 뒤가 비면 본문 다음 줄의 명령이 출력을 받는다
    expect(k(`python3 - <<'EOF' |\n${body}\nEOF\nsh`)).toBe('delete')
    expect(k(`python3 - <<'EOF' | sudo sh\n${body}\nEOF`)).toBe('outside')
  })
  it('출력을 읽기만 하는 프로그램(tail · head · grep · wc …)이 받으면 본문을 뺀다', () => {
    for (const tail of ['| tail -5', '2>&1 | tail -20', '| grep -v x | head -3', '| wc -l', '| cut -c1-80 | uniq -c', '|| true', '&& pnpm test', '; ls'])
      expect(k(`python3 - <<'EOF' ${tail}\n${body}\nEOF`), tail).toBe('run')
  })
  it('certainHeredoc 은 받는 프로그램이 모두 읽기만 하는지 알린다', () => {
    expect(certainHeredoc("python3 - <<'EOF' | tail -1\nx\nEOF")).toMatchObject({ piped: true, reader: true })
    expect(certainHeredoc("python3 - <<'EOF' | sh\nx\nEOF")).toMatchObject({ piped: true, reader: false })
    expect(certainHeredoc("python3 - <<'EOF' | tail -1 | sh\nx\nEOF")).toMatchObject({ piped: true, reader: false })
    expect(certainHeredoc("python3 - <<'EOF'\nx\nEOF")).toMatchObject({ piped: false, reader: true })
  })
})

describe('heredocBodiesRemoved', () => {
  it('cat 이 받는 자료만 뺀다. python 코드는 빼지 않는다: 코드가 프로그램을 돌리는 길을 다 알아낼 수 없다 (다섯째 검토)', () => {
    const cat = "cat > a.md <<'EOF'\ngit push origin main\nEOF\npnpm test"
    const py = "python3 - <<'EOF'\ns = 'gh pr merge'\nEOF"
    expect(heredocBodiesRemoved(cat)).toBe('cat > a.md </dev/null\npnpm test')
    expect(heredocBodiesRemoved(`${cat}\n${cat}`)).toBe('cat > a.md </dev/null\npnpm test\ncat > a.md </dev/null\npnpm test')
    for (const same of [py, `${py}\n${cat}`, "python3 - <<'EOF'\nimport os\no = os\no.system('git push')\nEOF", "cat <<'EOF' | sh\ngit push\nEOF", "bash <<'EOF'\ngit push\nEOF", "cat > a.md <<EOF\n$(git push)\nEOF", 'git push origin main'])
      expect(heredocBodiesRemoved(same), same).toBe(same)
  })
})
