/**
 * 중앙 대화의 우회 (11/20 사용자 결정 "권한 우회는 사용자 허락으로"): 상태 보기 목록(chat-readonly.ts)이 막은 명령도
 * 사용자가 그 명령을 보고 허락하면 돌릴 수 있다. 다만 아래는 허락해도 돌리지 않는다(우회 불가):
 * 강제 푸시 · reset --hard · main 지우기, 임시 폴더 밖 rm -rf, 연구 저장소 workbench/(노트 · 기록) 쓰기.
 * 셸 감싸기(sh -c · eval · xargs · find -exec · env · sudo …), 묶음(( … ) · { …; })과 $( … ) 안쪽도 같은 규칙으로 본다.
 * 옵션 줄임꼴(--har), 펼쳐서 만드는 옵션({--force,x} · --for${u}ce), 글자 그대로 적은 값의 변수(f=--force; git push $f)도 같은 것으로 읽는다
 */
import { GIT_VALUE, leading, noteVars, variants, wrapped } from './chat-auto.js'
import { alternatives, evalFlags, expandBraces, expandWords, hasBraces, heredocVariants, longOpt, prepare, redirects, segments, splitGroups, substitutions, words } from './chat-shell.js'

export type NeverBypass = 'force-push' | 'reset-hard' | 'delete-main' | 'rm-outside-temp' | 'workbench-write'

/** heads/main 도 main이다 (git이 refs/heads/main으로 읽는다) */
const MAIN = /^((refs\/)?heads\/)?(main|master)$/
const positional = (a: string[]) => a.filter((x) => !x.startsWith('-'))
/** 짧은 옵션 묶음(-rf · -fr)에 글자가 있는지 */
const short = (a: string[], ch: string) => a.some((x) => /^-[a-zA-Z]+$/.test(x) && x.includes(ch))
const wb = (x: string) => /(^|\/)workbench(\/|$)/.test(x)

/**
 * 임시 폴더 안 (그 폴더 자체는 아님). 상대 경로 · .. · 변수는 어디인지 모르니 밖으로 본다.
 * 중괄호는 펼쳐서 본다: /tmp/a/{b,c} 는 안이고, {/tmp/a,~/b} · /tmp/a/{.,}./{.,}./Users 는 밖이다. 다 펼치지 못할 만큼 많으면 밖으로
 */
export function inTemp(p: string): boolean {
  // (따옴표 친 빈칸이 든 낱말도 펼친다: '/tmp/a b'/{.,}./ 는 .. 가 된다)
  const all = expandBraces([p], true)
  return !all.some(hasBraces) && all.every(inTempOne)
}
function inTempOne(p: string): boolean {
  if (p.includes('..')) return false
  // 경로 가운데의 변수는 무엇이 될지 모른다 (/tmp/a/.$u./ 는 .. 가 된다). $TMPDIR 는 바로 뒤에 / 가 올 때만: $TMPDIRx 는 다른(빈) 변수다
  if (/\$/.test(p.replace(/^\$(?:TMPDIR|\{TMPDIR\})(?=\/)/, ''))) return false
  return /^(\/private)?\/tmp\/[^/]+|^(\/private)?\/var\/folders\/[^/]+\/[^/]+\/T\/[^/]+|^\$(?:TMPDIR|\{TMPDIR\})\/[^/]+/.test(p)
}

const FORCE = longOpt('--force', '--force-with-lease', '--force-if-includes', '--mirror')
const DELETE = longOpt('--delete')

function git(a: string[]): NeverBypass | undefined {
  // 앞 옵션: 값을 따로 받는 것(-C 폴더 · --git-dir 폴더 …)은 값까지 건너뛴다. 일하는 폴더를 바꾸는 값은 적어 둔다
  let i = 0
  const dirs: string[] = []
  while (i < a.length && a[i]!.startsWith('-')) {
    const attached = /^--work-tree=(.*)$/.exec(a[i]!)
    if (attached) dirs.push(attached[1]!)
    if (a[i] === '-C' || a[i] === '--work-tree') dirs.push(a[i + 1] ?? '')
    i += GIT_VALUE.test(a[i]!) ? 2 : 1
  }
  const sub = a[i] ?? ''
  const rest = a.slice(i + 1)
  const pos = positional(rest)
  const del = rest.some(DELETE) || short(rest, 'd')
  if (sub === 'push') {
    if (rest.some(FORCE) || short(rest, 'f') || pos.some((x) => x.startsWith('+'))) return 'force-push'
    if (pos.some((x) => x.startsWith(':') && MAIN.test(x.slice(1))) || (del && pos.some((x) => MAIN.test(x)))) return 'delete-main'
  }
  if (sub === 'reset' && rest.some(longOpt('--hard'))) return 'reset-hard'
  if (sub === 'branch' && (short(rest, 'D') || (del && (rest.some(longOpt('--force')) || short(rest, 'f')))) && pos.some((x) => MAIN.test(x))) return 'delete-main'
  if (sub === 'update-ref' && del && pos.some((x) => MAIN.test(x))) return 'delete-main'
  if (/^(checkout|restore|rm|mv|clean|stash|apply)$/.test(sub) && (rest.some(wb) || dirs.some(wb))) return 'workbench-write'
  return undefined
}

/** 인자를 고쳐 쓰는 프로그램: 어느 인자가 쓰는 곳인지 */
const WRITERS: Record<string, (a: string[]) => string[]> = {
  ...Object.fromEntries(['rm', 'mv', 'touch', 'tee', 'truncate', 'chmod', 'chown', 'rmdir', 'mkdir', 'unlink', 'patch', 'shred'].map((p) => [p, (a: string[]) => a])),
  ...Object.fromEntries(['cp', 'ln', 'install', 'rsync', 'ditto', 'scp'].map((p) => [p, (a: string[]) => positional(a).slice(-1)])),
  dd: (a) => a.filter((x) => x.startsWith('of=')),
}
const INLINE = /^(python3?|node|perl|ruby|osascript)$/
/** 쓰는 코드: 쓰기 모드('w' · 'a'), 펄의 ">파일", 쓰는 함수 이름 */
const WRITE_CODE = /['"][wa]\+?b?['"]|['"]\s*>|write|unlink|remove|rename|rmtree|truncate/i
/** awk 코드 안의 파일 쓰기: print … > "파일" · >> "파일" */
const AWK = /^[gmn]?awk$/
const AWK_WRITES = /print[^;}|]*>|>>?\s*"/

/**
 * 앞말과 묶음 말을 뗀다: 환경 변수 · env · time · nice · timeout …(chat-auto의 leading)과 sudo, 묶음의 ( · { · then · do.
 * 묶음을 떼지 않으면 `(git push --force)` · `{ git reset --hard; }`의 프로그램이 `(git` · `{` 로 읽혔다 (11/25 검토)
 */
function unwrap(w0: string[]): string[] {
  let w = w0
  for (;;) {
    w = leading(w).rest
    if (!w.length || !/^(sudo|doas)$/.test(w[0]!.split('/').pop()!)) return w
    w = w.slice(1)
    while (w.length && (w[0]!.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!))) w = w.slice(1)
  }
}
/** find가 뒤지는 곳: 첫 조건 앞의 낱말들 */
function findRoots(a: string[]): string[] {
  const out: string[] = []
  for (const x of a) {
    if (!out.length && /^-[HLPEXdsx]+$/.test(x)) continue
    if (x.startsWith('-') || x === '(' || x === '!') break
    out.push(x)
  }
  return out
}
/** find -exec 안의 {} 는 find가 뒤지는 곳의 것이다: 그 자리로 바꿔 본다 (임시 폴더만 뒤지면 그 안의 rm -rf 는 된다) */
const inFind = (inner: string[], roots: string[]) => inner.flatMap((x) => (x === '{}' ? (roots.length ? roots : ['.']) : [x]))

const SHELL = /^(sh|bash|zsh|dash|ksh|fish)$/

/** 적힌 낱말로도, 셸이 펼쳐 만들 수 있는 낱말로도 본다: git push {--force,origin,main} · --for${u}ce · rm -rf /tmp/a/{.,}./… */
function segment(w0: string[], depth: number): NeverBypass | undefined {
  for (const w of alternatives(unwrap(w0))) {
    const hit = segmentWords(w, depth)
    if (hit) return hit
  }
  return undefined
}

function segmentWords(w: string[], depth: number): NeverBypass | undefined {
  if (depth > 40) return undefined
  if (!w.length) return undefined
  const prog = w[0]!.split('/').pop()!
  const a = w.slice(1)
  // sh -c '…' · bash -c -- '…' · ksh -c · eval eval …: 안의 글을 같은 규칙으로
  if (SHELL.test(prog) || prog === 'eval') {
    for (const inner of wrapped(prog, a)) {
      const hit = typeof inner === 'string' ? neverBypass(inner, depth + 1) : undefined
      if (hit) return hit
    }
    return undefined
  }
  // find · xargs 가 돌리는 안의 명령도 본다. find -delete 는 뒤지는 곳을 rm -rf 하는 것과 같다
  if (prog === 'find' || prog === 'xargs') {
    const roots = prog === 'find' ? findRoots(a) : []
    if (prog === 'find' && a.includes('-delete')) {
      if (a.some(wb)) return 'workbench-write'
      if (!roots.length || !roots.every(inTemp)) return 'rm-outside-temp'
    }
    for (const inner of wrapped(prog, a)) {
      const r = typeof inner === 'string' ? undefined : segment(prog === 'find' ? inFind(inner, roots) : inner, depth + 1)
      if (r) return r
    }
    return undefined
  }
  if (prog === 'git') return git(a)
  if (prog === 'rm' && (short(a, 'r') || short(a, 'R') || a.includes('--recursive')) && (short(a, 'f') || a.includes('--force')) && (!positional(a).length || !positional(a).every(inTemp))) return 'rm-outside-temp'
  const writes = WRITERS[prog]
  if (writes && writes(a).some(wb)) return 'workbench-write'
  if (/^(sed|gsed|perl)$/.test(prog) && a.some((x) => /^(-i|--in-place|-\w*i)/.test(x)) && a.some(wb)) return 'workbench-write'
  if (INLINE.test(prog) && a.some((x) => /\bworkbench\//.test(x) && WRITE_CODE.test(x))) return 'workbench-write'
  if (AWK.test(prog) && a.some((x) => /\bworkbench\//.test(x) && AWK_WRITES.test(x))) return 'workbench-write'
  return undefined
}

/** 허락해도 돌리지 않는 명령이면 그 까닭, 아니면 undefined */
export function neverBypass(cmd0: string, depth = 0): NeverBypass | undefined {
  // 히어독으로도 읽어 본다 (본문의 따옴표가 뒤 명령을 가리는 꼴). 원래 글에서 걸리면 그것으로
  const hit = neverCore(cmd0, depth)
  if (hit) return hit
  for (const alt of depth < 3 ? heredocVariants(cmd0).slice(0, depth === 0 ? 4 : 1) : []) {
    const other = neverCore(alt, depth)
    if (other) return other
  }
  return undefined
}

function neverCore(cmd0: string, depth: number): NeverBypass | undefined {
  if (depth > 40) return undefined
  // 셸이 읽는 대로 고쳐 쓴 글로 본다: 줄 잇기, git push $'--force', 주석 · $'…' 안의 따옴표로 뒤 명령 숨기기
  const cmd = prepare(cmd0)
  // 겹친 $( $( … ) )도 안쪽부터 본다
  // zsh의 ${(e)…} 도 안의 글을 돌린다
  for (const part of [...substitutions(cmd).inner, ...evalFlags(cmd)]) {
    const r = neverBypass(part, depth + 1)
    if (r) return r
  }
  const vars = new Map<string, string[]>()
  for (const seg of segments(cmd)) {
    const r = redirects(seg)
    // 파일로 돌려보내기: 받는 곳이 workbench/ 안이면
    // (받는 곳도 적힌 그대로와 펼친 것을 둘 다 본다)
    if ([...r.out, ...expandWords(r.out)].some(wb)) return 'workbench-write'
    const all = words(r.rest)
    // 글자 그대로 적은 값의 변수는 그 값을 넣어서도 본다: f=--force; git push origin main $f
    for (const v of variants(seg, vars).texts) {
      const hit = neverBypass(v, depth + 1)
      if (hit) return hit
    }
    noteVars(all, vars)
    // `{ true } always { git push --force }` · `() { … }`: ; 없이 닫힌 묶음으로도 나눠 보고, 나누지 않고도 본다(인자로 쓴 { 는 낱말이다)
    for (const group of [all, ...splitGroups(all)]) {
      const hit = segment(group, depth)
      if (hit) return hit
    }
  }
  return undefined
}

/** 버려지는 곳 · 표준 출력 */
const SINK = /^(\/dev\/(null|stdout|stderr|tty)|&\d)$/
const keep = (p: string) => SINK.test(p) || inTemp(p)

/**
 * 임시 폴더 밖의 파일을 쓰는 명령인가 (11/24: 중앙 대화가 우회 허락으로 앱 코드를 직접 쓰려 했다. 중앙의 폴더는 실사용 앱이라
 * 파일 쓰기는 허락으로도 풀지 않고 하위 대화에 맡긴다). 돌려보내기(> · >> · heredoc을 받는 파일) · 쓰는 프로그램 · sed -i · 쓰는 코드를 본다
 */
export function writesFiles(cmd0: string, depth = 0): boolean {
  if (writesCore(cmd0, depth)) return true
  return (depth < 3 ? heredocVariants(cmd0).slice(0, depth === 0 ? 4 : 1) : []).some((alt) => writesCore(alt, depth))
}

function writesCore(cmd0: string, depth: number): boolean {
  if (depth > 40) return false
  // heredoc 본문(코드 속 => 등)은 명령이 아니다
  const cmd = prepare(cmd0).replace(/(<<-?\s*['"]?(\w+)['"]?[^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '$1')
  for (const part of substitutions(cmd).inner) if (writesFiles(part, depth + 1)) return true
  for (const seg of segments(cmd)) {
    const r = redirects(seg)
    // > · >> · &> · &>> 가 받는 파일 (11/25: &> 파일을 보지 못했다)
    if ([...r.out, ...expandWords(r.out)].some((x) => !keep(x))) return true
    const all = words(r.rest)
    if ([all, ...splitGroups(all)].some((group) => writesWords(group, depth))) return true
  }
  return false
}

const writesWords = (w0: string[], depth: number): boolean => alternatives(unwrap(w0)).some((w) => writesExpanded(w, depth))

function writesExpanded(w: string[], depth: number): boolean {
  if (depth > 40) return false
  if (!w.length) return false
  const prog = w[0]!.split('/').pop()!
  const a = w.slice(1)
  if (SHELL.test(prog) || prog === 'eval') return wrapped(prog, a).some((inner) => typeof inner === 'string' && writesFiles(inner, depth + 1))
  if (prog === 'find' || prog === 'xargs') {
    const roots = prog === 'find' ? findRoots(a) : []
    if (prog === 'find' && a.some((x) => /^-(fprint|fprint0|fprintf|fls)$/.test(x))) return true
    if (prog === 'find' && a.includes('-delete') && !(roots.length && roots.every(keep))) return true
    // xargs 는 받은 낱말을 뒤에 붙인다: 어디인지 모르는 자리로 본다
    return wrapped(prog, a).some((inner) => typeof inner !== 'string' && writesWords(prog === 'find' ? inFind(inner, roots) : inner.includes('{}') ? inner : [...inner, '{}'], depth + 1))
  }
  const writes = WRITERS[prog]
  if (writes && writes(a.filter((x) => !x.startsWith('-'))).some((x) => !keep(x))) return true
  if (/^(sed|gsed|perl)$/.test(prog) && a.some((x) => /^(-i|--in-place|-\w*i)/.test(x))) return true
  if (AWK.test(prog) && a.some((x) => AWK_WRITES.test(x))) return true
  return INLINE.test(prog) && a.some((x) => WRITE_CODE.test(x))
}
