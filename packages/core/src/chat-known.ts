/**
 * 끝까지 읽은 명령만 묻지 않고 지나가기 (2026-11-26 사용자 결정, 설계 docs/specs/2026-11-26-command-verdict-read-fully.md).
 * 명령 판정(chat-auto.ts commandKind)은 모르는 것을 만나면 「실행」으로 접는다. 「자동」 · 실행 「늘」에서는 그 「실행」을 묻지 않으므로,
 * 판정이 알아보지 못한 꼴은 묻지 않고 지나갔다. 이 검사는 그 "모름"을 따로 꺼낸다: 줄을 끝까지 읽지 못했으면 까닭을 돌려준다.
 * 판정을 대신하지 않고 더한다 (서버는 판정이 허락한 줄에만 이 검사를 건다). 그래서 이 검사가 무엇을 놓쳐도 지금보다 가벼워지지 않는다.
 * 인라인 코드(python3 -c · node -e · 코드를 받는 히어독)의 안은 읽지 않는다: 설계 2절의 한계
 */
import { DELETES, EDITS, leading, noteGroupVars, noteVars, OUTSIDE, READS, variants, wrapped } from './chat-auto.js'
import { evalFlags, qualifierRuns, qualifiers, redirects, segments, splitGroups, substitutions, unmask, words } from './chat-shell.js'
import { knownValue, unknownVarArg } from './chat-vars.js'

/** 읽지 못한 까닭. prog = 모르는 프로그램(이름은 name), 그 밖은 「읽지 못한 명령」으로 한 번 묻는다 */
export type Unread =
  | { why: 'prog'; name: string }
  | { why: 'var-prog' | 'subst' | 'var' | 'deep' }
  | { why: 'syntax' | 'env'; name: string }

/** 개발 도구 (설계 5.3, 11/26 사용자 결정 "제안대로"): 처음부터 묻지 않는 프로그램. 안전하다는 뜻이 아니라 나올 만하다는 뜻이다 */
export const DEV_TOOLS = ['pnpm', 'npm', 'npx', 'node', 'tsx', 'tsc', 'vitest', 'python3', 'python', 'perl', 'cargo', 'sleep', 'paste', 'ps', 'lsof', 'rev', 'base64', 'sips', 'hostname'] as const

/** 셸 내장 가운데 읽은 것으로 치는 것 (설계 5.2): 뒤의 글을 명령으로 다시 읽지 않고 셸 동작도 바꾸지 않는다 */
const BUILTINS = ['exit', 'break', 'continue', 'return', 'shift', ':', 'wait', 'local', 'export', 'unset', 'set', '[[', '((']
/** 판정이 이름으로 다루는 프로그램 (chat-auto.ts의 목록과 kindOf가 하위 명령을 보는 것) */
const JUDGED = ['git', 'xargs', 'sh', 'bash', 'zsh', 'dash', 'ksh', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'uv', 'conda', 'mamba', 'gem', 'cargo', 'go', 'julia', 'R', 'fd', 'fdfind']
const KNOWN = new Set<string>([...READS, ...EDITS, ...DELETES, ...OUTSIDE, ...JUDGED, ...BUILTINS, ...DEV_TOOLS])

/**
 * 뒤의 글이 명령으로 다시 읽히거나(eval · source · alias …), 읽기가 다루지 않는 문법(case · 함수 정의 · select …),
 * 셸 · zsh의 동작을 바꾸는 것(setopt · emulate · hash · fc · r …). 「늘」 없이 한 번 묻는다
 */
const SYNTAX = new Set(['eval', 'source', '.', 'exec', 'trap', 'alias', 'unalias', 'builtin', 'noglob', 'repeat', 'coproc', 'select', 'case', 'setopt', 'unsetopt', 'function', 'emulate', 'zmodload', 'autoload', 'enable', 'disable', 'hash', 'unhash', 'fc', 'r', 'functions', 'unfunction', 'bindkey', 'zle', 'compdef', 'enable', 'command_not_found_handler'])
/** 그 뒤의 명령을 그대로 돌리는 앞말 (leading이 떼는 것). 이것들 뒤의 낱말도 명령 자리다 */
const PREFIX = /^(time|nice|nohup|command|builtin|exec|noglob|nocorrect|-|timeout|gtimeout|caffeinate|stdbuf|env|repeat|coproc)$/
/** 묶음 머리: 이것들 뒤의 낱말이 명령 자리다 */
const GROUP_HEAD = /^(if|then|else|elif|do|while|until|always|!|\{|\(|\(\(|\[\[)$/
/** set 가운데 읽은 것으로 치는 꼴 (설계 5.2): -e -u -x -o pipefail 만 */
/** 맞지 않는 무늬를 그대로 두거나 지우기만 하는 setopt: 낱말 쪼개기 · 무늬 펼침의 뜻을 바꾸지 않는다 */
const SAFE_SETOPT = (args: string[]): boolean => args.length > 0 && args.every((a) => /^(no_?nomatch|nonomatch|null_?glob|no_?null_?glob)$/i.test(a))
const SET_READ = /^set(?: [-+](?:[eux]+|[eux]*o pipefail))*$/
/** 옵션 하나로 하는 일이 바뀌는 프로그램 (설계 5.2 다): 인자 맨 앞에 값을 모르는 변수가 오면 묻는다 */
// grep은 넣지 않는다: 어느 옵션도 프로그램을 돌리거나 파일을 쓰지 않는다 (11/26 실제 기록 비교: f=$(…); grep x $f 가 묻는 줄의 대부분이었다)
const OPTION_PROGS = /^(g?find|fd|fdfind|git|g?sed|sort|xargs|g?awk|rg|tar|rsync|cp|mv|ln|tee|chmod|touch|mkdir|curl|wget)$/
/** 쓰는 프로그램: 인자 어디든 값을 모르는 변수 · 치환이 있으면 어디를 쓸지 모른다 */
const WRITE_PROGS = /^(mv|cp|tee|ln|touch|mkdir|chmod|patch|install|rsync)$/
/** 값을 아는 환경 변수 (경로로 시작한다) */
const PATH_VARS = /^(HOME|PWD|TMPDIR)$/
/** 값을 다른 데서 받게 하는 명령: 적힌 이름은 그 뒤로 값을 모른다 (x=a; read x; find . $x) */
const TAKES = /^(read|export|typeset|declare|local|readonly|printf|mapfile|readarray|getopts|unset|integer|float)$/
/**
 * 다른 프로그램을 돌리게 하거나 찾는 길 · 설정을 바꾸는 환경 변수. 글자 값이라도 묻는다 (설계 5.2 나의 leading env).
 * 그 밖의 이름에 글자 값을 붙인 것(CI=1 · NODE_ENV=test · CHROMIUM_PATH=/opt/… )은 읽은 것이다 (설계 4절)
 */
const RISKY_ENV = /^(PATH|CDPATH|FPATH|MANPATH|HOME|ZDOTDIR|ENV|BASH_ENV|IFS|SHELL|PROMPT_COMMAND|PS[0-4]|BROWSER|VISUAL|EDITOR|PAGER|LESS\w*|GIT_\w+|LD_\w+|DYLD_\w+|NODE_OPTIONS|NODE_PATH|PYTHON\w+|PERL5\w+|PERLLIB|RUBY\w+|npm_config_\w+|NPM_CONFIG_\w+|PNPM_\w+|COREPACK_\w+|CC|CXX|CFLAGS|LDFLAGS|MAKEFLAGS|RUSTC\w*|CARGO_\w+|XDG_\w+|TMPDIR|\w*PAGER|\w*EDITOR|\w*ASKPASS|\w*_(COMMAND|CMD|PROGRAM|PROG|SHELL|EXEC|HOOK|HOOKS))$/i
/** 글자 그대로의 값 (변수 · 치환 · 무늬가 없는 것) */
const LITERAL = /^[\w./:,@%+=~-]*$/

const DEPTH_MAX = 40

/** known = 그 밖에 아는 프로그램인지 (사용자가 실행 「늘」로 허락한 것: run:<프로그램>) */
export interface KnownOpts { known?: (prog: string) => boolean }

/** 줄을 끝까지 읽었으면 undefined, 아니면 까닭 */
export function unreadWhy(cmd: string, o: KnownOpts = {}, depth = 0): Unread | undefined {
  if (depth > DEPTH_MAX) return { why: 'deep' }
  const text = dataHeredocsRemoved(cmd)
  const sub = substitutions(text, { proc: true })
  for (const part of sub.inner) { const r = part.startsWith('(') && part.endsWith(')') ? arithWhy(part.slice(1, -1), o, depth + 1) : unreadWhy(part, o, depth + 1); if (r) return r }
  if (sub.left) return { why: 'subst' }
  const vars = new Map<string, string[]>()
  const groupVars = new Map<string, string[]>()
  const safe = new Set<string>()
  const known = (n: string) => PATH_VARS.test(n) || safe.has(n) || knownValue(vars.get(n) ?? groupVars.get(n))
  for (const seg of segments(sub.flat)) {
    const raw = unmask(seg)
    const plain = raw.replace(/'[^']*'/g, "''")
    // zsh의 펼침 플래그 ${(…)…} · 글로브 · 쪼개기 플래그 ${=x} $~x · 이름으로 가리키기 ${!x} · =( … ): 값이 명령 · 옵션이 될 수 있다
    if (/\$\{\(|\$\{?[=~^]|\$\{!/.test(plain) || evalFlags(seg).length) return { why: 'syntax', name: '${(…)}' }
    for (const q of qualifiers(seg)) { const runs = qualifierRuns(q); if (runs.calls || runs.code.length) return { why: 'syntax', name: '*(…)' } }
    if (variants(raw, vars, 256).partial) return { why: 'var' }
    const r = redirects(seg)
    for (const target of r.out) if (target !== '/dev/null' && unknownIn(target, known)) return { why: 'var' }
    const all = words(r.rest)
    for (const group of [all, ...splitGroups(all)]) { const why = wordsWhy(group, o, depth, known); if (why) return why }
    track(all.map(unmask), vars, groupVars, safe)
  }
  return undefined
}

/** 셈 $(( … )): 명령이 아니다. 안의 치환만 본다 */
function arithWhy(text: string, o: KnownOpts, depth: number): Unread | undefined {
  const sub = substitutions(text, { proc: true })
  for (const part of sub.inner) { const r = unreadWhy(part, o, depth + 1); if (r) return r }
  return sub.left ? { why: 'subst' } : undefined
}

/** 낱말로 나눈 명령 하나 (감싸 돌리는 안의 명령도) */
function wordsWhy(all: string[], o: KnownOpts, depth: number, known: (n: string) => boolean, wrap = 0): Unread | undefined {
  if (wrap > 5) return { why: 'deep' }
  const raw = all.map(unmask)
  // 명령 자리의 낱말: 묶음 머리 · 대입 · 앞말과 그 옵션 뒤
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i]!
    if (w === 'setopt' && SAFE_SETOPT(raw.slice(i + 1))) return undefined
    if (SYNTAX.has(w) || /^[A-Za-z_][\w-]*\(\)$/.test(w) || (raw[i + 1] === '()' && /^[A-Za-z_][\w-]*$/.test(w))) return { why: 'syntax', name: w.replace(/\(\)$/, '') }
    const assign = /^([A-Za-z_]\w*)=(.*)$/s.exec(w)
    // 이 명령에만 붙는 환경 변수(A=1 cmd)와 홀로 선 대입(PATH=… ; cmd) 모두: 찾는 길 · 다른 프로그램을 바꾸는 이름은 묻는다
    if (assign && RISKY_ENV.test(assign[1]!)) return { why: 'env', name: assign[1]! }
    // 값의 $HOME · $PWD 는 정해진 값이다 (HOME을 바꾸는 대입은 위에서 묻는다)
    if (assign && i + 1 < raw.length && (!LITERAL.test(assign[2]!.replace(/\$\{?(HOME|PWD)\}?(?![\w])/g, '')) || assign[2]!.includes('SUBST'))) return { why: 'env', name: assign[1]! }
    if (GROUP_HEAD.test(w) || assign || PREFIX.test(w.split('/').pop()!) || (i > 0 && PREFIX.test(raw[i - 1]!.split('/').pop()!) && (w.startsWith('-') || /^\d/.test(w)))) continue
    break
  }
  const lead = leading(all)
  const w = lead.rest
  if (!w.length) return undefined
  const first = unmask(w[0]!)
  // 변수 · 치환 · 무늬 · 중괄호로 만든 프로그램 이름
  if (!/^\[\[?$/.test(first) && (/[$`*?[{]|SUBST/.test(first) || /^~(?!\/)/.test(first))) return { why: 'var-prog' }
  const prog = first.split('/').pop()!
  const args = w.slice(1).map(unmask)
  if (prog === 'setopt' && SAFE_SETOPT(args)) return undefined
  if (SYNTAX.has(prog)) return { why: 'syntax', name: prog }
  if (prog === 'set' && !SET_READ.test(['set', ...args].join(' '))) return { why: 'syntax', name: 'set' }
  // export · local 로 찾는 길을 바꾸는 이름
  for (const a of /^(export|local|typeset|declare|readonly)$/.test(prog) ? args : []) { const n = /^([A-Za-z_]\w*)=/.exec(a)?.[1]; if (n && RISKY_ENV.test(n)) return { why: 'env', name: n } }
  if (!knownProg(first, prog, o)) return { why: 'prog', name: prog }
  if (unknownVarArg(w, prog, known, OPTION_PROGS)) return { why: 'var' }
  if (WRITE_PROGS.test(prog) && args.some((a) => !a.startsWith('-') && unknownIn(a, known))) return { why: 'var' }
  for (const x of wrapped(prog, args)) {
    const r = typeof x === 'string' ? unreadWhy(x, o, depth + 1) : wordsWhy(x, o, depth, known, wrap + 1)
    if (r) return r
  }
  return undefined
}

/** 아는 프로그램 (설계 5.3): 판정이 이름으로 다루는 것 · 개발 도구 · 실행 「늘」 · 작업 폴더 안의 스크립트. 경로로 적은 것은 마지막 이름으로 */
function knownProg(word: string, prog: string, o: KnownOpts): boolean {
  if (KNOWN.has(prog) || o.known?.(prog)) return true
  // 작업 폴더 안의 스크립트 (./scripts/x.sh · scripts/x.sh): 에이전트가 쓸 수 있는 파일이라 인라인 코드와 같다
  return word.includes('/') && !/^[/~]/.test(word) && !word.split('/').includes('..')
}

/** 낱말에 값을 모르는 변수 · 치환이 있는가 (쓰기 대상) */
function unknownIn(word: string, known: (n: string) => boolean): boolean {
  if (/SUBST|`|\$\(/.test(word)) return true
  for (const m of word.matchAll(/\$(?:\{([^}]*)\}|([A-Za-z_]\w*|[0-9@*#?$!-]))/g)) {
    const name = m[2] ?? /^[A-Za-z_]\w*/.exec(m[1] ?? '')?.[0]
    if (!name || !known(name)) return true
  }
  return false
}

/** 이 조각이 정한 변수를 적는다: 글자 값 (noteVars · noteGroupVars), 옵션이 될 수 없는 반복 변수, 다른 데서 값을 받은 이름 */
function track(all: string[], vars: Map<string, string[]>, groupVars: Map<string, string[]>, safe: Set<string>): void {
  noteVars(all, vars)
  noteGroupVars(all, groupVars)
  const w = /^(do|then|else|elif|if|while|until|\{|!)$/.test(all[0] ?? '') ? all.slice(1) : all
  if (w[0] === 'for' && /^[A-Za-z_]\w*$/.test(w[1] ?? '') && w[2] === 'in') {
    // for f in src/*.ts: 도는 낱말이 모두 옵션이 될 수 없는 글자로 시작하면 그 변수는 옵션이 되지 못한다 (chat-vars.ts VarWatch와 같은 규칙)
    if (w.length > 3 && w.slice(3).every((x) => /^[A-Za-z0-9_./]/.test(x) && !/[$`]|SUBST/.test(x))) safe.add(w[1]!); else safe.delete(w[1]!)
    return
  }
  if (TAKES.test(w[0] ?? '')) for (const x of w.slice(1)) { const n = /^([A-Za-z_]\w*)(=|$)/.exec(x)?.[1]; if (n) { vars.delete(n); groupVars.delete(n); safe.delete(n) } }
}

/** 히어독의 본문을 자료로 받는 프로그램: 본문을 셸 글로 읽지 않는다 (코드를 받는 python · node · perl 은 인라인 코드라 읽지 않는다) */
const DATA_RECEIVERS = /^(cat|tee|python3?|node|perl|git|gh|jq|wc|head|tail|grep|sort|uniq|cut|diff|patch|base64)$/
/** | 로 본문을 받아도 읽기만 하는 프로그램 (chat-shell.ts certainHeredoc 의 READERS와 같다) */
const PIPE_READERS = /^(tail|head|grep|wc|uniq|cut|cat|tee)$/

/**
 * 자료를 주는 히어독의 본문을 뺀 글 (설계 5.2 "자료를 주는 히어독은 읽은 것"): 커밋 메시지 · 메모의 따옴표와 괄호가 치환의 짝을 어긋나게 하지 않게.
 * 받는 프로그램이 DATA_RECEIVERS 이고, 받는 줄의 | 뒤가 읽기만 하는 것이고, 본문이 펼쳐지지 않을 때(구분자를 따옴표로 쌌거나 본문에 $ ` \\ 가 없다)만 뺀다.
 * << 를 잘못 짚어 본문이 아닌 줄을 빼도 이 검사가 덜 물을 뿐, 판정(commandKind)은 원래 글을 그대로 읽으므로 지금보다 가벼워지지 않는다
 */
export function dataHeredocsRemoved(cmd: string): string {
  if (!cmd.includes('<<')) return cmd
  return cmd.replace(/(^|\n)([^\n]*?)(<<-?)[ \t]*(['"]?)([A-Za-z_]\w*)\4([^\n]*)\n([\s\S]*?)\n([ \t]*)\5[ \t]*(?=\n|$|\))/g, (whole, nl: string, head: string, op: string, quote: string, delim: string, tail: string, body: string, indent: string) => {
    if (head.includes('<<') || tail.includes('<<')) return whole
    if (indent && (op !== '<<-' || /[^\t]/.test(indent))) return whole
    if (!quote && /[$`\\]/.test(body)) return whole
    const receiver = head.split(/&&|\|\||[;&|(`]|\$\(/).pop()!.trim()
    const prog = (words(receiver.replace(/^[({!\s]+/, ''))[0] ?? '').split('/').pop()!
    if (!DATA_RECEIVERS.test(prog)) return whole
    const pipes = [...tail.matchAll(/(?<!\|)\|(?!\|)&?[ \t]*([^ \t|&;)]*)/g)]
    if (!pipes.every((m) => PIPE_READERS.test(m[1]!))) return whole
    // 받는 줄의 << 구분자는 </dev/null 로: 끝 줄(구분자)이 명령으로 읽히지 않게 본문과 함께 뺀다
    return `${nl}${head}</dev/null${tail}`
  })
}
