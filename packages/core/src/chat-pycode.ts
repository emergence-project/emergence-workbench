/**
 * python 이 받는 히어독의 코드 보기 (11/26 "heredoc 본문 오탐"): 코드를 셸 글로 읽지 않고, 폴더 밖을 가리키는 글과
 * 다른 프로그램을 돌리는 코드만 찾는다. chat-auto.ts의 commandKind가 확실한 히어독(chat-shell.ts certainHeredoc)에서 쓴다.
 * 코드를 돌려 보는 것이 아니라 글만 본다: 걸러 내는 것이지 막는 것이 아니다.
 */

/** 시스템 폴더의 첫 마디(소문자로 견준다): 코드 글 속의 /api/x · </div> 같은 것은 경로로 보지 않으려고 이 마디(와 홈 · 작업 폴더의 첫 마디)로 시작하는 것만 본다 */
const REAL_ROOT = new Set(['users', 'home', 'root', 'etc', 'usr', 'var', 'tmp', 'private', 'opt', 'bin', 'sbin', 'dev', 'lib', 'lib64', 'library', 'applications', 'system', 'volumes', 'network', 'cores', 'mnt', 'media', 'srv', 'proc', 'sys', 'boot', 'run', 'snap', 'nix',
  'data', 'workspace', 'workspaces', 'scratch', 'work', 'gpfs', 'lustre', 'project', 'projects', 'shared', 'export', 'net', 'afs', 'nfs', 'storage', 'vol'])
/** 코드 글 어디든(문자열 안의 명령 글 · 주석 포함) 낱말 처음에 선 ~/… 와 /마디/… (옵션에 붙은 -C/etc 도) */
const CODE_PATH = /(?:^|[^\w.~\/-]|(?<=[\s'"]-[A-Za-z]))(~\/[^\s'"`),;|&<>\]}]*|\/[A-Za-z][\w.-]*(?:\/[^\s'"`),;|&<>\]}]*)?)/g
/** 홈을 값으로 얻는 코드 */
const CODE_HOME = /\bPath\.home\s*\(|\bexpanduser\s*\(|\b(?:environ|getenv)\b[^\n]{0,40}\bHOME\b/
/**
 * 뿌리(/ · /* · /**)를 인자로 넘기는 코드: 파일을 다루는 부름의 인자 자리, os.path.join('/', …), 변수에 담기.
 * split('/') · '/'.join(…) · JS의 .join('/') 처럼 글자로 쓰는 / 는 아니다
 */
const CODE_ROOT = new RegExp([
  String.raw`\b(?:Path|PurePath|walk|listdir|scandir|chdir|rmtree|open|glob|iglob|remove|unlink|rmdir|makedirs|mkdir|extractall|copytree|move|copy\w*|chmod|chown|stat|disk_usage)\s*\((?:[^()\n]*[,=])?\s*[rbuf]{0,2}(['"])\/[*\/]*\1`,
  String.raw`\bjoin\s*\(\s*(['"])\/\2\s*,`,
  String.raw`^[ \t]*\w+[ \t]*=[ \t]*(['"])\/\3[ \t]*$`,
].join('|'), 'm')
/**
 * 다른 프로그램을 돌리거나 글을 코드로 돌리는 코드: 문자열에 든 셸 글이 실제로 돈다. 이런 본문은 빼지 않고 전처럼 읽는다.
 * os 를 다른 이름으로 들이는 꼴(from os import · import os as · getattr(os, …))과 홀로 선 system( · popen( 도 본다.
 * 고칠 소스 글에 흔한 .exec( · .compile( (정규식 · JS)는 아니다
 */
const CODE_SPAWNS = /\bos\s*\.\s*(?:system|popen|exec\w*|spawn\w*|posix_spawn\w*|startfile)\b|subprocess|\bfrom\s+os\s+import\b|\bos\s+as\b|\b(?:vars|locals)\s*\(|\b__builtins__\b|\bpkgutil\b|\bwebbrowser\b|\bdistutils\b|\bgetattr\s*\(\s*\(?\s*os\b|\bvars\s*\(\s*os\b|\(\s*os\s*\)\s*\.|(?<![\w.])posix\s*\.|\bimport\s+sh\b|\bplumbum\b|\bctypes\b|\bimport\s+pty\b|\bpty\s*\.|\bpexpect\b|\bgetoutput\b|\bshell\s*=\s*True\b|\b__import__\b|\b__dict__\b|\b__getattribute__\b|\bglobals\s*\(|\bimportlib\b|\bfrom\s+posix\s+import\b|\bimport\s+posix\b|\w\s*\.\s*os\b|\bpydoc\b|\bpipepager\b|\bmultiprocessing\b|\btimeit\b|\bsys\s*\.\s*modules\b|\bbuiltins\b|(?<![\w.])(?:exec|eval|compile|system|popen|execv\w*|execl\w*|spawn[lv]\w*)\s*\(/

/** 파이썬 코드의 한 줄 문자열('…' · "…")들. 세 겹 따옴표 글(고칠 소스를 통째로 담는 곳)과 주석은 건너뛴다 */
function pyLineStrings(code: string): string[] {
  const out: string[] = []
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!
    if (ch === '#') { const e = code.indexOf('\n', i); i = e < 0 ? code.length : e; continue }
    if (ch !== "'" && ch !== '"') continue
    const triple = code.startsWith(ch.repeat(3), i)
    const q = triple ? ch.repeat(3) : ch
    let j = i + q.length
    for (; j < code.length; j++) {
      if (code[j] === '\\') { j++; continue }
      if (triple ? code.startsWith(q, j) : code[j] === ch || code[j] === '\n') break
    }
    if (!triple) out.push(code.slice(i + 1, j))
    i = j + q.length - 1
  }
  return out
}

/**
 * python 이 받는 히어독의 코드가 폴더 밖을 가리키는가. 코드를 돌려 보는 것이 아니라 글만 본다: 걸러 내는 것이지 막는 것이 아니다
 * (문자열을 이어 붙여 만든 경로 · 목록에 없는 낯선 뿌리는 보지 못한다. python -c 의 코드는 전부터 보지 않았다).
 * - 코드 글 어디든 ~/… 나 시스템 폴더 · 홈 · 작업 폴더의 첫 마디로 시작하는 절대 경로가 폴더 밖이면
 * - 한 줄 문자열 안의 낱말이 ~ · ~다른사람 · .. 으로 폴더를 벗어나는 경로면, 문자열이 통째로 낯선 꼴의 절대 경로(/.x · //x)면
 *   (세 겹 따옴표 안의 '../api' 같은 소스 글과, 따옴표로 시작하는 낱말은 아니다)
 * - 홈을 값으로 얻거나(Path.home() · expanduser( · environ['HOME']) 뿌리를 인자로 넘기면(open('/') · extractall(path='/') · join('/', …) · d = '/').
 *   문자열 속에 홀로 선 / 는 보지 않는다: CSS · 글의 「a / b」와 주석 표시가 훨씬 흔하다
 */
export function codeTouchesOutside(code: string, o: { cwd: string; home?: string }, outside: (path: string) => boolean): boolean {
  if (CODE_HOME.test(code) || CODE_ROOT.test(code)) return true
  const roots = new Set([...REAL_ROOT, (o.cwd.split('/')[1] ?? '').toLowerCase(), ((o.home ?? '').split('/')[1] ?? '').toLowerCase()])
  let n = 0
  for (const m of code.matchAll(CODE_PATH)) {
    const s = m[1]!
    if (!s.startsWith('~') && !roots.has(s.split('/')[1]!.toLowerCase())) continue
    // 터무니없이 많으면 하나씩 보지 않는다
    if (++n > 400 || outside(s)) return true
  }
  for (const s of pyLineStrings(code)) {
    if (/^\/[._0-9\/]\S*$/.test(s) && (++n > 400 || outside(s))) return true
    for (const t of s.split(/\s+/)) {
      if (!(/^~[\w.-]*(\/|$)/.test(t) || t === '..' || t.startsWith('../') || t.includes('/../') || t.endsWith('/..'))) continue
      if (++n > 400 || outside(t)) return true
    }
  }
  return false
}

/** 다른 프로그램을 돌리거나 글을 코드로 돌리는 코드인가 (그러면 본문을 빼지 않고 전처럼 읽는다) */
/** os 를 값으로 쓰는 꼴 (o = os · [os] · (os,) …): import 줄과 os.이름 · 따옴표 · 경로 안의 os 는 아니다 */
const OS_VALUE = /(?<![\w.'"\/:@-])os\b(?![ \t]*[.\w'"\/:-])/
/**
 * 다른 프로그램을 돌리거나 글을 코드로 돌리는 코드인가 (그러면 본문을 빼지 않고 전처럼 읽는다).
 * python 은 이름을 NFKC 로 고쳐 읽으므로(전각 ｏs = os) 같은 꼴로 고쳐서 본다. 목록은 걸러 내는 것이다: 낯선 길은 지나간다
 */
export function codeSpawns(code0: string): boolean {
  const code = code0.normalize('NFKC')
  return CODE_SPAWNS.test(code) || OS_VALUE.test(code.replace(/^[ \t]*import[ \t][^\n;]*/gm, ''))
}
