/**
 * 상태만 보는 명령 (11/18 사용자 결정 "중앙은 읽기 명령을 직접"): 중앙 대화(와 그가 띄운 보조 에이전트)가
 * 묻지 않고 돌려도 되는 명령인지 판정한다. 허용 목록 방식: 모든 조각이 목록에 있어야 하고, 무엇이든
 * 바꿀 수 있는 문법(파일로 돌려보내기 · 히어독 · 백그라운드 · 환경 변수 앞말 · 다른 명령을 돌리는 프로그램)은 막는다.
 * ok = 묻지 않고, sensitive = 비밀이 든 곳(~/.ssh · .env …)을 보니 한 번 묻고, no = 막는다
 */
import { bare, segments, substitutions, unmask, words } from './chat-auto.js'

export type StateOnly = 'ok' | 'sensitive' | 'no'

type Rule = (args: string[]) => boolean
const any: Rule = () => true
const without = (...bad: string[]): Rule => (args) => !args.some((a) => bad.some((b) => a === b || (b.startsWith('--') && a.startsWith(`${b}=`))))
const positional = (args: string[]) => args.filter((a) => !a.startsWith('-'))
/**
 * 하위 명령은 첫 낱말이어야 한다. 그 앞에는 값을 따로 받지 않는 옵션만 둔다 (11/21 보안 검토):
 * 첫 "옵션 아닌 낱말"로 고르면 `npm --loglevel info run build`처럼 옵션의 값이 허용한 이름일 때 뒤의 진짜 하위 명령이 그냥 돌았다
 */
const LEAD = /^(-g|--global|-r|--recursive|--json|--long|--parseable|-a|--all|--[\w-]+=.*)$/
const sub = (allowed: Record<string, Rule>, bad: string[] = []): Rule => (args) => {
  let i = 0
  while (i < args.length && LEAD.test(args[i]!)) i++
  const rule = allowed[args[i] ?? '']
  return !!rule && !args.some((a) => bad.includes(a) || bad.some((b) => b.startsWith('--') && a.startsWith(`${b}=`))) && rule(args.slice(i + 1))
}
/** 파일 이름으로 펼쳐지는 글자 */
const GLOB = (x: string) => /[*?[]/.test(x)
const versionOnly: Rule = (args) => args.length === 1 && /^(-v|-V|--version)$/.test(args[0]!)
/** 긴 옵션의 줄임꼴도 같은 옵션으로 본다 (git · getopt_long은 --outp=x 를 --output=x 로 읽는다) */
const longOpt = (...names: string[]) => (x: string) => {
  const k = x.split('=')[0]!
  return k.length >= 3 && k.startsWith('--') && names.some((n) => n.startsWith(k))
}

const GIT: Record<string, Rule> = {
  log: any, status: any, diff: any, show: any, blame: any, 'ls-files': any, 'rev-parse': any, describe: any, shortlog: any, 'ls-tree': any,
  'cat-file': any, 'merge-base': any, 'name-rev': any, whatchanged: any, 'rev-list': any, 'for-each-ref': any, 'show-ref': any,
  'show-branch': any, 'count-objects': any, cherry: any, 'range-diff': any, 'check-ignore': any, 'check-attr': any, 'verify-commit': any,
  'verify-tag': any, version: any,
  // --upload-pack · -u 와 숨은 같은 옵션 --exec 는 지정한 프로그램을 돌린다
  'ls-remote': (a) => !a.some((x) => /^-u/.test(x) || longOpt('--upload-pack', '--exec')(x)),
  worktree: (a) => a[0] === 'list',
  submodule: (a) => a.length === 0 || a[0] === 'status',
  // -O · --open-files-in-pager는 지정한 프로그램을 돌린다
  grep: (a) => !a.some((x) => /^-[a-zA-Z]*O/.test(x) || longOpt('--open-files-in-pager')(x)),
  branch: (a) => a.every((x) => /^(-a|-r|-v|-vv|--all|--remotes|--list|-l|--show-current|--verbose)$/.test(x)),
  remote: (a) => a.length === 0 || a.every((x) => x === '-v') || /^(show|get-url)$/.test(a[0] ?? ''),
  reflog: (a) => a.length === 0 || a[0] === 'show' || a[0]!.startsWith('-'),
  stash: (a) => /^(list|show)$/.test(a[0] ?? ''),
  tag: (a) => a.length === 0 || a.some((x) => x === '-l' || x === '--list'),
  // 읽기만: 쓰는 옵션 · 하위 명령(set · unset · edit …)이 하나라도 있으면 막는다 (설정은 프로그램을 바꿔 돌릴 수 있다)
  config: (a) => (a.some((x) => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(x)) || /^(get|list)$/.test(positional(a)[0] ?? ''))
    && !a.some((x) => /^(--add|--replace-all|--unset|--unset-all|--rename-section|--remove-section|--edit|-e|--file|-f|--blob)(=|$)/.test(x))
    && !/^(set|unset|edit|rename-section|remove-section)$/.test(positional(a)[0] ?? ''),
}
/** gh api: GET만. 몸을 붙이는 -f · -F · --input은 POST가 되므로 -X GET을 적었을 때만, graphql은 mutation이 없을 때만 */
const ghApi: Rule = (a) => {
  const method = a.flatMap((x, i) => x === '-X' || x === '--method' ? [a[i + 1] ?? ''] : x.startsWith('--method=') ? [x.slice(9)] : x.startsWith('-X') && x.length > 2 ? [x.slice(2)] : [])
  if (method.some((m) => m.toUpperCase() !== 'GET') || a.some((x) => /^--input/.test(x))) return false
  // graphql: mutation이 없을 때만. 파일에서 읽는 질의(-F query=@파일)는 안을 볼 수 없어 막는다
  // 질의를 변수 · 치환으로 넣은 것도 안을 볼 수 없다 (-f query="$(cat q.txt)")
  if (a.includes('graphql')) return !a.some((x) => /\bmutation\b/i.test(x) || /=@/.test(x) || /SUBST|\$/.test(x))
  return method.length > 0 || !a.some((x) => /^(-f|-F|--field|--raw-field)/.test(x))
}
const LOOK: Rule = sub({ view: any, list: any })
const GH: Record<string, Rule> = {
  pr: sub({ view: any, list: any, diff: any, checks: any, status: any }),
  run: sub({ view: any, list: any, watch: any }),
  issue: sub({ view: any, list: any, status: any }),
  repo: LOOK, release: LOOK, workflow: LOOK, label: sub({ list: any }), gist: LOOK, cache: sub({ list: any }),
  search: sub({ repos: any, issues: any, prs: any, commits: any, code: any }),
  status: any,
  auth: sub({ status: without('--show-token', '-t') }),
  api: ghApi,
}

/**
 * 중앙의 git · gh 쓰기 (11/19 사용자 결정 "중앙은 깃 편집 권한"): 커밋 · 브랜치 · 푸시 · PR 만들기 · squash 합치기.
 * 되돌리기 어려운 것(강제 푸시 · 원격 브랜치 지우기 · branch -D · 강제 태그)과, 중앙의 작업 폴더인 실사용 앱 체크아웃의
 * 파일을 바꾸는 것(checkout · switch · merge · rebase · pull · stash · restore · reset · clean)은 목록에 없어 막힌다
 */
const flagsOnly = (ok: RegExp): Rule => (args) => args.every((x) => !x.startsWith('-') || ok.test(x))
const GIT_WRITE: Record<string, Rule> = {
  ...GIT,
  add: any,
  commit: any,
  // --upload-pack은 지정한 프로그램을 돌린다
  fetch: (a) => !a.some(longOpt('--upload-pack')),
  branch: flagsOnly(/^(-a|-r|-v|-vv|--all|--remotes|--list|-l|--show-current|--verbose|-d|--delete|-m|--move|-c|--copy|-t|--track|--no-track|-u|--set-upstream-to(=.*)?|--unset-upstream)$/),
  tag: flagsOnly(/^(-l|--list|-a|--annotate|-m|--message(=.*)?|-s|--sign)$/),
  // + 강제 refspec · :지우기 refspec도 막는다.
  // main에 바로 올리는 것은 묻는다 (11/20 사용자 결정 "추천대로"): 받는 가지를 적은 푸시만 ok이고,
  // 가지를 적지 않았거나 HEAD만 적은 푸시는 지금 가지가 main일 수 있어 묻는다
  push: (a) => {
    if (!flagsOnly(/^(-u|--set-upstream|--tags|--follow-tags|--no-verify|--dry-run|-n|-v|--verbose|-q|--quiet)$/)(a)) return false
    const refs = positional(a).slice(1)
    if (a.some((x) => x === '--dry-run' || x === '-n')) return !refs.some((x) => x.startsWith('+') || x.startsWith(':'))
    return refs.length > 0 && refs.every((x) => {
      if (x.startsWith('+') || x.startsWith(':') || /[*$]/.test(x)) return false
      const to = (x.includes(':') ? x.slice(x.indexOf(':') + 1) : x).replace(/^(refs\/)?(heads|tags)\//, '')
      return !!to && !/^(HEAD|@|main|master)$/.test(to)
    })
  },
}
const GH_WRITE: Record<string, Rule> = {
  ...GH,
  pr: sub({
    view: any, list: any, diff: any, checks: any, status: any,
    // comment는 뺐다: 공개 PR에 사용자 이름으로 남는 글이라 허락 카드로 묻는다 (11/20 사용자 결정 "추천대로")
    create: any, edit: any, ready: any,
    // squash로만. --admin은 검사를 건너뛰고, -d는 이 폴더의 브랜치를 바꾼다
    merge: (a) => a.some((x) => x === '--squash' || x === '-s') && flagsOnly(/^(--squash|-s|--auto|--subject(=.*)?|-t|--body(=.*)?|-b|--match-head-commit(=.*)?)$/)(a),
  }),
}

function gitRule(table: Record<string, Rule>): Rule {
  return (a) => {
    // 앞 옵션: -C <폴더> · --no-pager만 (-c 설정은 프로그램을 바꿔 돌릴 수 있다)
    let i = 0
    while (i < a.length && a[i]!.startsWith('-')) {
      if (a[i] === '-C') i += 2
      else if (a[i] === '--no-pager') i++
      else return versionOnly(a)
    }
    const rule = table[a[i] ?? '']
    const rest = a.slice(i + 1)
    return !!rule && !rest.some(longOpt('--output', '--ext-diff')) && rule(rest)
  }
}
function ghRule(table: Record<string, Rule>): Rule {
  return (a) => {
    if (versionOnly(a)) return true
    if (a.some((x) => x === '--web' || x === '-w')) return false
    // gh api -X GET <경로>: 첫 낱말이 api면 옵션 값(GET)을 하위 명령으로 읽지 않게 따로 본다
    return a[0] === 'api' ? ghApi(a.slice(1)) : sub(table)(a)
  }
}
const PKG: Record<string, Rule> = { ls: any, list: any, view: any, info: any, why: any, outdated: any, root: any }

/**
 * find: 지우거나 파일을 쓰는 동작은 막고, -exec · -execdir 는 안의 명령이 이 목록의 읽기 명령일 때만 (11/20 "중앙 읽기 명령은 묻지 않고").
 * -ok는 묻는 입력을 기다려 막는다
 */
const findRule: Rule = (a) => {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    if (/^-(ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(x)) return false
    if (x !== '-exec' && x !== '-execdir') continue
    // find는 「{} +」일 때만 +에서 끝난다: 홀로 선 +(sort -t + -o 파일) 뒤의 인자를 놓치지 않게
    const end = a.findIndex((y, j) => j > i && (y === ';' || (y === '+' && a[j - 1] === '{}')))
    if (end < 0) return false
    const [prog, ...args] = a.slice(i + 1, end)
    if (!prog || prog === 'find' || (prog.includes('/') && !/^\/(usr\/)?bin\/[^/]+$/.test(prog))) return false
    const rule = PROGRAMS[prog.split('/').pop()!]
    if (!rule || !rule(args)) return false
    // + 는 찾은 파일을 한 번에 여럿 붙인다: 둘째 이름이 쓸 파일인 프로그램(uniq · json.tool)은 ; 로만
    if (a[end] === '+' && /^(uniq|python3?)$/.test(prog.split('/').pop()!)) return false
    i = end
  }
  return true
}

/**
 * python -c 로 JSON · 기록을 읽어 보이기 (11/20 "중앙 읽기 명령은 묻지 않고"): -I(현재 폴더의 같은 이름 모듈을 읽지 않음)를 붙이고,
 * 허용한 모듈만 가져오고, 파일은 읽기로만 열고, 쉘 변수($)나 이름을 숨기는 문법(__ · \x 이스케이프 · getattr · eval)이 없을 때만.
 * 파일 이름은 코드 안에 넣지 않고 sys.argv로 넘긴다. python -m json.tool <파일> 도 (두 번째 이름은 쓸 파일이라 막는다)
 */
const PY_MODULES = new Set([
  'json', 'sys', 'os', 'os.path', 're', 'collections', 'itertools', 'functools', 'math', 'statistics', 'glob', 'fnmatch', 'datetime', 'time',
  'textwrap', 'pprint', 'csv', 'heapq', 'bisect', 'unicodedata', 'tomllib', 'pathlib', 'difflib', 'hashlib',
])
/** os. 뒤에 올 수 있는 것: 보기만 하는 것 (os.environ은 열쇠가 들어 있어 뺀다) */
const PY_OS = /^(path|listdir|scandir|walk|stat|lstat|getcwd|sep|linesep|curdir|pardir|name|devnull|cpu_count|getpid|uname|readlink|access|fspath|get_terminal_size|statvfs|R_OK|F_OK|X_OK|W_OK)$/
const PY_SYS = /^(argv|stdin|stdout|stderr|version|version_info|platform|exit|maxsize|getsizeof|executable|getdefaultencoding)$/
// attrgetter · methodcaller(pathlib · glob에 딸려 온다)는 getattr와 같고, 프레임(gi_frame.f_builtins)에서는 exec를 꺼낼 수 있다 (11/21 보안 검토)
const PY_BAD = /\b(exec|eval|getattr|setattr|delattr|globals|locals|vars|breakpoint|help|input|attrgetter|methodcaller|operator|[a-z]{2}_frame|f_builtins|f_globals|f_locals|f_back|write_text|write_bytes|touch|mkdir|unlink|rmdir|rename|symlink_to|hardlink_to|link_to|chmod|lchmod|chown)\b/
/** 문자열 안을 _ 로, 주석을 빈칸으로 가린 같은 길이의 글 (괄호 · 쉼표를 셀 때). 닫히지 않으면 null */
function maskStrings(code: string): string | null {
  let out = ''
  for (let i = 0; i < code.length;) {
    const ch = code[i]!
    // 주석은 줄 끝까지 빈칸으로: 주석 안의 따옴표를 문자열의 처음으로 읽으면 그 뒤의 진짜 코드(둘째 값 'w')가 문자열로 가려진다 (11/25 검토)
    if (ch === '#') { const end = code.indexOf('\n', i); const to = end < 0 ? code.length : end; out += ' '.repeat(to - i); i = to; continue }
    if (ch !== '"' && ch !== "'") { out += ch; i++; continue }
    const q = code.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch
    let j = i + q.length
    while (j < code.length && !code.startsWith(q, j)) j += code[j] === '\\' ? 2 : 1
    if (j >= code.length) return null
    out += q + '_'.repeat(j - i - q.length) + q
    i = j + q.length
  }
  return out
}
const PY_READ_MODE = /^\s*['"][rbt]*['"]\s*$/
function pythonCode(raw: string): boolean {
  // 파이썬은 이름을 NFKC로 읽는다: 전각 글자로 적은 ｅｖａｌ도 eval이다 (11/21 보안 검토)
  const code = raw.normalize('NFKC')
  if (/[$]|SUBST|__|\\[xuUN0-7]/.test(code)) return false
  if (PY_BAD.test(code)) return false
  // 다른 모듈에 딸린 모듈(glob.os · json.codecs · collections._sys)로 os 검사를 비켜 가지 못하게
  if (/\.\s*(os|sys|io|subprocess|shutil|codecs|builtins|posix|nt|importlib|posixpath|ntpath|genericpath|tempfile|socket|ctypes|pickle|marshal|signal|fcntl|mmap|pty|runpy|threading|_\w*)\b/.test(code)) return false
  // 가져오기: 허용한 모듈만, * 와 다른 이름 붙이기(as)는 막는다 (import os as o 로 아래 os. 검사를 비켜 가지 못하게)
  for (const m of code.matchAll(/\b(?:from\s+([\w.]+)\s+)?import\s+([^;\n]+)/g)) {
    if (/\bas\b/.test(m[2]!)) return false
    if (m[1]) {
      if (!PY_MODULES.has(m[1]) || m[2]!.includes('*')) return false
      if (m[1] === 'os' && !m[2]!.split(',').every((n) => PY_OS.test(n.trim().split(/\s+/)[0]!))) return false
      if (m[1] === 'sys' && !m[2]!.split(',').every((n) => PY_SYS.test(n.trim().split(/\s+/)[0]!))) return false
    } else if (!m[2]!.split(',').every((n) => PY_MODULES.has(n.trim().split(/\s+/)[0]!))) return false
  }
  // os · sys는 늘 os.<보기> · sys.<보기> 꼴로만 (다른 이름에 담아 os.replace 를 숨기지 못하게)
  for (const m of code.matchAll(/\b(os|sys)\b(\s*\.\s*(\w+))?/g)) {
    const before = code.slice(0, m.index)
    if (/(import|from)\s+([\w.]+\s*,\s*)*$/.test(before) || /\bfrom\s+$/.test(before)) continue
    if (/\.\s*$/.test(before)) continue
    if (!m[3] || !(m[1] === 'os' ? PY_OS : PY_SYS).test(m[3])) return false
  }
  // pathlib을 쓰면 Path.replace도 파일을 옮기므로 .replace 를 막는다
  if (/\b(pathlib|Path)\b/.test(code) && /\.\s*(replace|copy|move)\w*\b/.test(code)) return false
  // open: 이름으로만 부르고(다른 이름에 담지 않고), 모드는 읽기 글자만. 11/21 보안 검토에서 막은 것:
  // open(*값) · Path(…).open('w')(첫 값이 모드) · mode='r' if 0 else 'w' · 문자열 안의 괄호로 둘째 값을 숨기기 · 문자열(f-string) 안의 open
  const masked = maskStrings(code)
  if (masked === null) return false
  for (const m of code.matchAll(/\bopen\b/g)) {
    const at = m.index
    if (masked.slice(at, at + 4) !== 'open') return false
    const lead = /^\s*\(/.exec(masked.slice(at + 4))
    if (!lead) return false
    const start = at + 4 + lead[0].length
    const cuts = [start]
    let depth = 0
    let end = start
    for (; end < masked.length; end++) {
      const ch = masked[end]!
      if ('([{'.includes(ch)) depth++
      else if (')]}'.includes(ch)) { if (depth === 0) break; depth-- }
      else if (ch === ',' && depth === 0) cuts.push(end + 1)
    }
    if (end >= masked.length) return false
    const method = /\.\s*$/.test(masked.slice(0, at))
    for (const [k, from] of cuts.entries()) {
      const part = code.slice(from, k + 1 < cuts.length ? cuts[k + 1]! - 1 : end)
      if (/^\s*\*/.test(part)) return false
      const kw = /^\s*(\w+)\s*=(?!=)/.exec(part)
      if (kw) { if (kw[1] === 'opener' || (kw[1] === 'mode' && !PY_READ_MODE.test(part.slice(kw[0].length)))) return false; continue }
      if (k === (method ? 0 : 1) && part.trim() && !PY_READ_MODE.test(part)) return false
    }
  }
  return true
}
const pythonRule: Rule = (a) => {
  if (versionOnly(a)) return true
  let i = 0
  let isolated = false
  while (i < a.length && /^-[IsSEBu]+$/.test(a[i]!)) { if (a[i]!.includes('I')) isolated = true; i++ }
  if (!isolated) return false
  if (a[i] === '-m' && a[i + 1] === 'json.tool') {
    const rest = a.slice(i + 2)
    return rest.every((x) => !x.startsWith('-') || /^--(sort-keys|compact|json-lines|no-ensure-ascii|tab|no-indent)$/.test(x)) && positional(rest).length <= 1 && !rest.some(GLOB)
  }
  if (!isolated) return false
  return a[i] === '-c' && typeof a[i + 1] === 'string' && pythonCode(a[i + 1]!)
}

const PROGRAMS: Record<string, Rule> = {
  ...Object.fromEntries([
    'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'which', 'type', 'stat', 'du', 'df', 'pwd', 'whoami', 'id', 'uname',
    'sw_vers', 'uptime', 'vm_stat', 'nproc', 'diff', 'cmp', 'jq', 'cut', 'tr', 'nl', 'column', 'echo', 'printf', 'cd', 'basename', 'dirname',
    'realpath', 'readlink', 'true', 'false', 'test', '[', 'system_profiler',
  ].map((p) => [p, any])),
  // 파일을 쓰거나 다른 프로그램을 돌리는 옵션은 뺀다. 짧은 옵션은 붙여 쓴 꼴(-ofile · -uo)도 막는다
  sort: (a) => !a.some((x) => longOpt('--output', '--compress-program')(x) || /^-[a-zA-Z]*o/.test(x)),
  // -R은 폴더마다 -o 00Tree.html을 쓴다
  tree: (a) => !a.some((x) => /^-[a-zA-Z]*[oR]/.test(x)),
  rg: without('--pre', '--hostname-bin'),
  // -C는 magic 파일을 컴파일해 쓴다
  file: (a) => !a.some((x) => /^-[a-zA-Z]*C/.test(x) || longOpt('--compile')(x)),
  // 둘째 이름은 쓸 파일이다: 별표가 두 파일로 펼쳐져도 그렇다
  uniq: (a) => positional(a).length <= 1 && !a.some(GLOB),
  date: (a) => positional(a).every((x) => x.startsWith('+')) && !a.includes('-s') && !a.some(longOpt('--set')),
  hostname: (a) => positional(a).length === 0,
  find: findRule,
  sysctl: (a) => !a.some((x) => x.includes('=') || /^-\w*w/.test(x)),
  // ps e · -E는 다른 프로세스의 환경 변수(열쇠)를 보인다
  ps: (a) => !a.some((x) => /^-[a-zA-Z]*E/.test(x) || x.includes('$') || (!x.startsWith('-') && /e/.test(x))),
  top: (a) => a.includes('-l'),
  // -l은 실제로 메모리 압박을 건다
  memory_pressure: (a) => a.length === 0 || (a.length === 1 && a[0] === '-Q'),
  pmset: (a) => a[0] === '-g',
  diskutil: (a) => /^(list|info)$/.test(a[0] ?? ''),
  defaults: (a) => /^(read|domains)$/.test(a[0] ?? ''),
  command: (a) => /^-[vV]$/.test(a[0] ?? ''),
  git: gitRule(GIT),
  gh: ghRule(GH),
  npm: (a) => versionOnly(a) || sub(PKG)(a),
  pnpm: (a) => versionOnly(a) || sub(PKG)(a),
  yarn: (a) => versionOnly(a) || sub({ list: any, info: any, why: any })(a),
  brew: (a) => versionOnly(a) || sub({ list: any, info: any, config: any, ls: any })(a),
  python: pythonRule,
  python3: pythonRule,
  ...Object.fromEntries(['node', 'claude', 'codex', 'gemini', 'uv', 'tex', 'latexmk'].map((p) => [p, versionOnly])),
}

/** 비밀이 든 곳 (열쇠 · 토큰 · 환경 파일): 읽기라도 한 번 묻는다 */
const SECRET = /(^|\/)\.(ssh|aws|gnupg|netrc|docker|kube)(\/|$)|\.config\/gh(\/|$)|Keychains|credentials|(^|\/)\.env(\.|$)|id_(rsa|ed25519|ecdsa|dsa)/
/** 앱의 개인 설정 · 대화 기록 폴더와 키체인 꺼내기: 자동 모드에서도 읽기 전에 한 번 묻는다 (11/23) */
const APP_SECRET = /research-workspace\/personal\/_(settings|chats)(\/|$)|\bsecurity\s+(find|dump|export)-/
/** 열쇠가 든 환경 변수를 펼치는 글: echo $GITHUB_TOKEN 은 열쇠를 대화에 적는다 (11/25 검토) */
// 이름이 그 말로 끝나거나 _ 로 이어질 때만 ($MAX_TOKENS · $TOKENIZER 는 아니다)
const SECRET_VAR = /\$\{?\w*(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|CREDENTIALS?)(?![A-Za-z])/
/** 경로나 명령이 비밀이 든 곳을 건드리는지 (자동 모드의 읽기 · 명령 판정) */
/** 명령 줄이면 낱말마다도 본다: SECRET은 경로의 처음(^)을 보므로 줄 전체에 대면 `cat .env` · `cd ~/.aws`를 놓친다 */
export const touchesSecret = (text: string) => SECRET.test(text) || APP_SECRET.test(text) || SECRET_VAR.test(text) || (/\s/.test(text) && text.split(/[\s'"=;|&<>()]+/).some((w) => !!w && SECRET.test(w)))

/** 파일로 쓰지 않는 돌려보내기 (오류를 합치기 · 버리기) */
const HARMLESS_REDIRECT = /(?:\d?>&\d+(?=[\s;&|)<>]|$)|&>\s*\/dev\/null|\d?>>?\s*\/dev\/null)/g

/**
 * 셸이 낱말을 바꾸는 문법 (11/21 보안 검토). 판정은 적힌 낱말을 보는데 셸은 돌리기 전에 낱말을 펼친다:
 * `find .$IFS-delete` · `find . -{delete,print}` 는 -delete 가 되고, 반복 변수에 ". -delete"를 담아도 그렇다. `${x@P}` 는 값 안의 명령을 돌린다.
 * 그래서 ① ${이름} · ${이름%무늬} · ${이름#무늬} 밖의 ${ } 는 어디서든 막고, ② 옵션을 가리는 프로그램에서는 중괄호 펼침과 변수를 막되
 * 값이 한 낱말로 정해진 것($HOME 등, 글자 그대로 적은 반복 낱말의 변수)이 옵션 아닌 낱말에 든 것만 둔다
 */
const PARAM_ODD = /\$\{(?![A-Za-z_]\w*(?:[%#]{1,2}[^}$`@]*)?\})/
const BRACES = /\{[^{}]*(,|\.\.)[^{}]*\}/
const VAR = /\$\{?([A-Za-z_]\w*)?/g
/** 펼쳐지는 $ (뒤에 이름 · 숫자 · { · 특수 변수 글자가 온다. 정규식의 끝 $ 는 아니다). zsh의 $=x · $~x · $^x · $+x 도: $=x 는 값을 낱말로 쪼갠다 */
const EXPANDS = /\$[A-Za-z_0-9{$?!#*@=~^+-]/
const SAFE_VARS = /^(HOME|PWD|USER|TMPDIR)$/
/** 반복문에 글자 그대로 적은 낱말: 빈칸 · 별표 · 중괄호 · = 가 없고 - 로 시작하지 않아, 변수로 써도 낱말 하나이고 옵션이 되지 않는다 */
const SIMPLE_WORD = /^[^\s\-*?[\]{}~$=][^\s*?[\]{}$=]*$/
function expansionsOk(prog: string, args: string[], loopVars: Set<string>): boolean {
  for (const x of args) {
    if (BRACES.test(x) && (prog !== 'rg' || /^[-{]/.test(x))) return false
    // 옵션 이름에 든 별표 · 물음표는 그 이름의 파일이 있으면 다른 옵션으로 펼쳐진다 (값 쪽 --glob=*.ts 는 둔다)
    if (x.startsWith('-') && GLOB(x.split('=')[0]!)) return false
    if (!EXPANDS.test(x)) continue
    if (x.startsWith('-')) return false
    for (const m of x.matchAll(VAR)) {
      if (!m[1]) { if (EXPANDS.test(x.slice(m.index, m.index + 2))) return false; continue }
      if (!SAFE_VARS.test(m[1]) && !loopVars.has(m[1])) return false
    }
  }
  return true
}

/**
 * 줄 잇기(\\ + 줄바꿈)를 셸처럼 지운다: 그대로 두면 `-del\\⏎ete`가 한 낱말 -delete 로 읽히지 않는다 (11/21 보안 검토).
 * 작은따옴표 안에서는 글자 그대로다
 */
function joinLines(cmd: string): string {
  if (!cmd.includes('\\\n')) return cmd
  let out = ''
  let q: string | null = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (q === "'") { if (ch === q) q = null; out += ch; continue }
    if (ch === '\\' && i + 1 < cmd.length) { if (cmd[i + 1] !== '\n') out += ch + cmd[i + 1]; i++; continue }
    if (q) { if (ch === q) q = null } else if (ch === '"' || ch === "'") q = ch
    out += ch
  }
  return out
}

const WRITE_PROGRAMS: Record<string, Rule> = { ...PROGRAMS, git: gitRule(GIT_WRITE), gh: ghRule(GH_WRITE) }

/** gitWrites: 중앙용. 상태 보기에 더해 git · gh로 커밋 · 가지 푸시(main 아님) · PR 만들기 · squash 합치기까지 ok */
export function stateOnlyCommand(raw: string, o: { gitWrites?: boolean } = {}, depth = 0): StateOnly {
  if (depth > 2) return 'no'
  const cmd = joinLines(raw)
  const programs = o.gitWrites ? WRITE_PROGRAMS : PROGRAMS
  let worst: StateOnly = SECRET_VAR.test(cmd) ? 'sensitive' : 'ok'
  // $'…' · $"…" (따옴표 안의 \\' 를 다르게 읽는 문법)은 해석하지 않고 막는다
  if (/\$['"]/.test(cmd) || PARAM_ODD.test(cmd)) return 'no'
  const loopVars = new Set<string>()
  // $( … ) · ` … `: 안쪽도 같은 목록으로 보고, 자리표 낱말로 바꾼다 (겹친 것은 안쪽부터, 다 풀지 못하면 막는다)
  const { inner: inners, flat, left } = substitutions(cmd)
  if (left) return 'no'
  for (const part of inners) {
    const inner = stateOnlyCommand(part, o, depth + 1)
    if (inner === 'no') return 'no'
    if (inner === 'sensitive') worst = 'sensitive'
  }
  const b = bare(flat)
  // 따옴표 밖에 남은 괄호도 막는다: zsh의 =( 명령 ) · 무늬 꼬리표 *(e:'명령':) · *(+이름)은 명령을 돌리고, 묶음 ( … )은 이 목록이 읽지 않는다
  if (/\$\(|`|<<|[()]/.test(b)) return 'no'
  const noRedirect = b.replace(HARMLESS_REDIRECT, ' ')
  if (/>/.test(noRedirect)) return 'no'
  // 홀로 선 & (백그라운드)
  if (/(^|[^&])&([^&]|$)/.test(noRedirect.replace(/&&/g, '  '))) return 'no'
  for (const seg of segments(flat)) {
    // 규칙은 진짜 글을 본다: 작은따옴표 안을 가린 채로 두면 python -c 'exec(…)' 의 exec( 가 보이지 않는다
    let w = words(seg.replace(HARMLESS_REDIRECT, ' ').replace(/<\s*/g, ' ')).map(unmask)
    // for 반복문 (11/20): for 이름 in 낱말…; do 명령; done. 낱말은 글자 그대로 적은 것만(-로 시작하거나 $ · $( ) 가 들면
    // 반복 변수가 옵션이 될 수 있어 막는다). do 뒤 명령은 같은 목록으로 본다
    if (w[0] === 'for') {
      if (!/^[A-Za-z_]\w*$/.test(w[1] ?? '') || w[2] !== 'in' || w.slice(3).some((x) => x.startsWith('-') || /\$|SUBST/.test(x))) return 'no'
      if (w.some((x) => SECRET.test(x))) worst = 'sensitive'
      if (w.slice(3).every((x) => SIMPLE_WORD.test(x))) loopVars.add(w[1]!)
      else loopVars.delete(w[1]!)
      continue
    }
    if (w[0] === 'done' && w.length === 1) continue
    if (w[0] === 'do') w = w.slice(1)
    if (!w.length) continue
    const prog = w[0]!
    // 환경 변수 앞말(PAGER=… git log)이나 변수 · 저장소 안 스크립트(./ls)를 프로그램으로 돌리지 않는다
    if (prog.includes('=') || prog.includes('$')) return 'no'
    if (prog.includes('/') && !/^\/(usr\/)?s?bin\/[^/]+$/.test(prog)) return 'no'
    const rule = programs[prog.split('/').pop()!]
    if (!rule || !rule(w.slice(1))) return 'no'
    // python -c 코드 뒤의 낱말은 sys.argv일 뿐 옵션이 되지 않는다 (for f in *.json; do python3 -I -c "…" "$f"; done)
    const name = prog.split('/').pop()!, code = /^python3?$/.test(name) ? w.indexOf('-c') : -1
    if (rule !== any && !expansionsOk(name, code > 0 ? w.slice(1, code + 2) : w.slice(1), loopVars)) return 'no'
    // $( … )의 출력이 옵션이 되지 않게: 옵션을 가리는 프로그램에서는 $( … )로 시작하거나 옵션 안에 든 낱말을 막는다
    // (git log $(git merge-base …)..HEAD 처럼 안쪽이 모두 git이면 둔다)
    if (rule !== any && w.slice(1).some((x) => (x.startsWith('-') && x.includes('SUBST')) || (x.startsWith('SUBST') && !(prog === 'git' && inners.every((p) => /^\s*git\s/.test(p)))))) return 'no'
    if (w.some((x) => SECRET.test(x))) worst = 'sensitive'
  }
  return worst
}
