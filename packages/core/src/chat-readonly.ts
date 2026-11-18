/**
 * 상태만 보는 명령 (11/18 사용자 결정 "중앙은 읽기 명령을 직접"): 중앙 대화(와 그가 띄운 보조 에이전트)가
 * 묻지 않고 돌려도 되는 명령인지 판정한다. 허용 목록 방식: 모든 조각이 목록에 있어야 하고, 무엇이든
 * 바꿀 수 있는 문법(파일로 돌려보내기 · 히어독 · 백그라운드 · 환경 변수 앞말 · 다른 명령을 돌리는 프로그램)은 막는다.
 * ok = 묻지 않고, sensitive = 비밀이 든 곳(~/.ssh · .env …)을 보니 한 번 묻고, no = 막는다
 */
import { segments, words } from './chat-auto.js'

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
  'cat-file': any, 'merge-base': any, 'name-rev': any, whatchanged: any,
  // -O · --open-files-in-pager는 지정한 프로그램을 돌린다
  grep: (a) => !a.some((x) => /^(-O|--open-files-in-pager)/.test(x)),
  branch: (a) => a.every((x) => /^(-a|-r|-v|-vv|--all|--remotes|--list|-l|--show-current|--verbose)$/.test(x)),
  remote: (a) => a.length === 0 || a.every((x) => x === '-v') || /^(show|get-url)$/.test(a[0] ?? ''),
  reflog: (a) => a.length === 0 || a[0] === 'show' || a[0]!.startsWith('-'),
  stash: (a) => /^(list|show)$/.test(a[0] ?? ''),
  tag: (a) => a.length === 0 || a.some((x) => x === '-l' || x === '--list'),
  config: (a) => a.some((x) => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(x)),
}
const GH: Record<string, Rule> = {
  pr: sub({ view: any, list: any, diff: any, checks: any, status: any }),
  run: sub({ view: any, list: any }),
  issue: sub({ view: any, list: any }),
  repo: sub({ view: any }),
}
const PKG: Record<string, Rule> = { ls: any, list: any, view: any, info: any, why: any, outdated: any, root: any }

const PROGRAMS: Record<string, Rule> = {
  ...Object.fromEntries([
    'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'which', 'type', 'file', 'stat', 'du', 'df', 'pwd', 'whoami', 'id', 'uname',
    'sw_vers', 'uptime', 'vm_stat', 'nproc', 'diff', 'cmp', 'jq', 'cut', 'tr', 'nl', 'column', 'echo', 'printf', 'cd', 'basename', 'dirname',
    'realpath', 'readlink', 'true', 'false', 'test', '[', 'system_profiler',
  ].map((p) => [p, any])),
  // 파일을 쓰거나 다른 프로그램을 돌리는 옵션은 뺀다
  sort: without('-o', '--output'),
  tree: without('-o'),
  rg: without('--pre'),
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
  git: (a) => {
    // 앞 옵션: -C <폴더> · --no-pager만 (-c 설정은 프로그램을 바꿔 돌릴 수 있다)
    let i = 0
    while (i < a.length && a[i]!.startsWith('-')) {
      if (a[i] === '-C') i += 2
      else if (a[i] === '--no-pager') i++
      else return versionOnly(a)
    }
    const rule = GIT[a[i] ?? '']
    const rest = a.slice(i + 1)
    return !!rule && !rest.some((x) => /^(--output|--ext-diff)/.test(x)) && rule(rest)
  },
  gh: (a) => versionOnly(a) || (!a.some((x) => x === '--web' || x === '-w') && sub(GH)(a)),
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

/** 따옴표 안을 지운 글 (문법 기호를 찾을 때) */
function bare(cmd: string): string {
  let out = ''
  let q: string | null = null
  for (const ch of cmd) {
    if (q) { if (ch === q) { q = null; out += ch } else out += '_'; continue }
    if (ch === '"' || ch === "'") q = ch
    out += ch
  }
  return out
}

export function stateOnlyCommand(cmd: string, depth = 0): StateOnly {
  if (depth > 2) return 'no'
  let worst: StateOnly = 'ok'
  // $( … ) · ` … `: 안쪽도 같은 목록으로 보고, 자리표 낱말로 바꾼다 (겹친 것은 해석하지 않고 막는다)
  const subst = /\$\(([^()`]*)\)|`([^`]*)`/g
  for (const m of cmd.matchAll(subst)) {
    const inner = stateOnlyCommand(m[1] ?? m[2] ?? '', depth + 1)
    if (inner === 'no') return 'no'
    if (inner === 'sensitive') worst = 'sensitive'
  }
  const flat = cmd.replace(subst, 'SUBST')
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
    const rule = PROGRAMS[prog.split('/').pop()!]
    if (!rule || !rule(w.slice(1))) return 'no'
    if (w.some((x) => SECRET.test(x))) worst = 'sensitive'
  }
  return worst
}
