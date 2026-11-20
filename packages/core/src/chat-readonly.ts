/**
 * 상태만 보는 명령 (11/18 사용자 결정 "중앙은 읽기 명령을 직접"): 중앙 대화(와 그가 띄운 보조 에이전트)가
 * 묻지 않고 돌려도 되는 명령인지 판정한다. 허용 목록 방식: 모든 조각이 목록에 있어야 하고, 무엇이든
 * 바꿀 수 있는 문법(파일로 돌려보내기 · 히어독 · 백그라운드 · 환경 변수 앞말 · 다른 명령을 돌리는 프로그램)은 막는다.
 * ok = 묻지 않고, sensitive = 비밀이 든 곳(~/.ssh · .env …)을 보니 한 번 묻고, no = 막는다
 */
import { segments, substitutions, words } from './chat-auto.js'

export type StateOnly = 'ok' | 'sensitive' | 'no'

type Rule = (args: string[]) => boolean
const any: Rule = () => true
const without = (...bad: string[]): Rule => (args) => !args.some((a) => bad.some((b) => a === b || (b.startsWith('--') && a.startsWith(`${b}=`))))
const positional = (args: string[]) => args.filter((a) => !a.startsWith('-'))
const sub = (allowed: Record<string, Rule>, bad: string[] = []): Rule => (args) => {
  const s = positional(args)[0] ?? ''
  const rule = allowed[s]
  return !!rule && !args.some((a) => bad.includes(a) || bad.some((b) => b.startsWith('--') && a.startsWith(`${b}=`))) && rule(args.slice(args.indexOf(s) + 1))
}
const versionOnly: Rule = (args) => args.length === 1 && /^(-v|-V|--version)$/.test(args[0]!)

const GIT: Record<string, Rule> = {
  log: any, status: any, diff: any, show: any, blame: any, 'ls-files': any, 'rev-parse': any, describe: any, shortlog: any, 'ls-tree': any,
  'cat-file': any, 'merge-base': any, 'name-rev': any, whatchanged: any, 'rev-list': any, 'for-each-ref': any, 'show-ref': any,
  'show-branch': any, 'count-objects': any, cherry: any, 'range-diff': any, 'check-ignore': any, 'check-attr': any, 'verify-commit': any,
  'verify-tag': any, version: any,
  // --upload-pack · -u 는 지정한 프로그램을 돌린다
  'ls-remote': (a) => !a.some((x) => /^(--upload-pack|-u)/.test(x)),
  worktree: (a) => a[0] === 'list',
  submodule: (a) => a.length === 0 || a[0] === 'status',
  // -O · --open-files-in-pager는 지정한 프로그램을 돌린다
  grep: (a) => !a.some((x) => /^(-O|--open-files-in-pager)/.test(x)),
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
  if (a.includes('graphql')) return !a.some((x) => /\bmutation\b/i.test(x) || /=@/.test(x))
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
  fetch: (a) => !a.some((x) => /^--upload-pack/.test(x)),
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
      const to = (x.includes(':') ? x.slice(x.indexOf(':') + 1) : x).replace(/^refs\/(heads|tags)\//, '')
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
    return !!rule && !rest.some((x) => /^(--output|--ext-diff)/.test(x)) && rule(rest)
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

const PROGRAMS: Record<string, Rule> = {
  ...Object.fromEntries([
    'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'which', 'type', 'stat', 'du', 'df', 'pwd', 'whoami', 'id', 'uname',
    'sw_vers', 'uptime', 'vm_stat', 'nproc', 'diff', 'cmp', 'jq', 'cut', 'tr', 'nl', 'column', 'echo', 'printf', 'cd', 'basename', 'dirname',
    'realpath', 'readlink', 'true', 'false', 'test', '[', 'system_profiler',
  ].map((p) => [p, any])),
  // 파일을 쓰거나 다른 프로그램을 돌리는 옵션은 뺀다. 짧은 옵션은 붙여 쓴 꼴(-ofile · -uo)도 막는다
  sort: (a) => !a.some((x) => /^--output(=|$)/.test(x) || /^-[a-zA-Z]*o/.test(x)),
  // -R은 폴더마다 -o 00Tree.html을 쓴다
  tree: (a) => !a.some((x) => /^-(o|R)/.test(x)),
  rg: without('--pre', '--hostname-bin'),
  // -C는 magic 파일을 컴파일해 쓴다
  file: (a) => !a.some((x) => /^-[a-zA-Z]*C/.test(x) || x === '--compile'),
  uniq: (a) => positional(a).length <= 1,
  date: (a) => positional(a).every((x) => x.startsWith('+')) && !a.includes('-s'),
  hostname: (a) => positional(a).length === 0,
  find: without('-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls'),
  sysctl: (a) => !a.some((x) => x.includes('=') || /^-\w*w/.test(x)),
  // ps e · -E는 다른 프로세스의 환경 변수(열쇠)를 보인다
  ps: (a) => !a.some((x) => x === '-E' || (!x.startsWith('-') && /e/.test(x))),
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
  ...Object.fromEntries(['node', 'python', 'python3', 'claude', 'codex', 'gemini', 'uv', 'tex', 'latexmk'].map((p) => [p, versionOnly])),
}

/** 비밀이 든 곳 (열쇠 · 토큰 · 환경 파일): 읽기라도 한 번 묻는다 */
const SECRET = /(^|\/)\.(ssh|aws|gnupg|netrc|docker|kube)(\/|$)|\.config\/gh(\/|$)|Keychains|credentials|(^|\/)\.env(\.|$)|id_(rsa|ed25519|ecdsa|dsa)/

/** 파일로 쓰지 않는 돌려보내기 (오류를 합치기 · 버리기) */
const HARMLESS_REDIRECT = /(?:\d?>&\d|&>\s*\/dev\/null|\d?>>?\s*\/dev\/null)/g

/** 따옴표 안과 \\ 뒤 글자를 지운 글 (문법 기호를 찾을 때). \\" 는 따옴표를 열지 않는다 */
function bare(cmd: string): string {
  let out = ''
  let q: string | null = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (q) {
      if (q === '"' && ch === '\\' && i + 1 < cmd.length) { out += '__'; i++ }
      else if (ch === q) { q = null; out += ch }
      else out += '_'
      continue
    }
    if (ch === '\\' && i + 1 < cmd.length) { out += '__'; i++; continue }
    if (ch === '"' || ch === "'") q = ch
    out += ch
  }
  return out
}

const WRITE_PROGRAMS: Record<string, Rule> = { ...PROGRAMS, git: gitRule(GIT_WRITE), gh: ghRule(GH_WRITE) }

/** gitWrites: 중앙용. 상태 보기에 더해 git · gh로 커밋 · 가지 푸시(main 아님) · PR 만들기 · squash 합치기까지 ok */
export function stateOnlyCommand(cmd: string, o: { gitWrites?: boolean } = {}, depth = 0): StateOnly {
  if (depth > 2) return 'no'
  const programs = o.gitWrites ? WRITE_PROGRAMS : PROGRAMS
  let worst: StateOnly = 'ok'
  // $'…' · $"…" (따옴표 안의 \\' 를 다르게 읽는 문법)은 해석하지 않고 막는다
  if (/\$['"]/.test(cmd)) return 'no'
  // $( … ) · ` … `: 안쪽도 같은 목록으로 보고, 자리표 낱말로 바꾼다 (겹친 것은 안쪽부터, 다 풀지 못하면 막는다)
  const { inner: inners, flat, left } = substitutions(cmd)
  if (left) return 'no'
  for (const part of inners) {
    const inner = stateOnlyCommand(part, o, depth + 1)
    if (inner === 'no') return 'no'
    if (inner === 'sensitive') worst = 'sensitive'
  }
  const b = bare(flat)
  if (/\$\(|`|<<|<\(|>\(/.test(b)) return 'no'
  const noRedirect = b.replace(HARMLESS_REDIRECT, ' ')
  if (/>/.test(noRedirect)) return 'no'
  // 홀로 선 & (백그라운드)
  if (/(^|[^&])&([^&]|$)/.test(noRedirect.replace(/&&/g, '  '))) return 'no'
  for (const seg of segments(flat)) {
    const w = words(seg.replace(HARMLESS_REDIRECT, ' ').replace(/<\s*/g, ' '))
    if (!w.length) continue
    const prog = w[0]!
    // 환경 변수 앞말(PAGER=… git log)이나 변수 · 저장소 안 스크립트(./ls)를 프로그램으로 돌리지 않는다
    if (prog.includes('=') || prog.includes('$')) return 'no'
    if (prog.includes('/') && !/^\/(usr\/)?s?bin\/[^/]+$/.test(prog)) return 'no'
    const rule = programs[prog.split('/').pop()!]
    if (!rule || !rule(w.slice(1))) return 'no'
    if (w.some((x) => SECRET.test(x))) worst = 'sensitive'
  }
  return worst
}
