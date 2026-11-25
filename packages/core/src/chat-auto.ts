/**
 * 에이전트 대화의 권한을 명령 대신 하는 일로 (10/28 사용자 결정, 시안 4절 "읽기 · 편집 · 실행 · 외부"):
 * 명령 한 줄이 무엇을 하는지 판정하고(commandKind), 권한 이름마다의 「자동 허용」 기본값(presetAuto)을 둔다.
 * 서버의 허락 판정(agentChats.ts judge)과 화면의 토글(AgentChats.tsx)이 함께 쓴다.
 */
import { qualifierRuns, qualifiers, redirects, segments, substitutions, unmask, words } from './chat-shell.js'

// 셸 글 읽기는 chat-shell.ts로 옮겼다: 여기서 가져다 쓰던 곳을 위해 그대로 내보낸다
export { ansiQuotes, bare, redirects, segments, substitutions, unmask, words } from './chat-shell.js'

export type ChatKind = 'read' | 'edit' | 'delete' | 'run' | 'web' | 'outside'
export interface ChatAutoValues { read: boolean; run: boolean; web: boolean }

type Mode = 'ask' | 'plan' | 'edit' | 'auto'
/** 권한 이름(읽기 전용 · 묻고 하기 · 계획 모드 · 편집 자동 허용 · 자동)의 토글 기본값. 편집은 모드가 정한다. 자동은 셋 다 켠다 (11/23) */
export function presetAuto(write: 'read' | 'notes', mode: Mode): ChatAutoValues {
  if (write !== 'read' && mode === 'auto') return { read: true, run: true, web: true }
  if (write === 'read' || mode !== 'ask') return { read: true, run: false, web: false }
  return { read: false, run: false, web: false }
}

/** 이 대화의 토글 값: 기본값 위에 하나씩 바꾼 것 */
export function autoOf(c: { write: 'read' | 'notes'; mode: Mode; auto?: Partial<ChatAutoValues> }): ChatAutoValues {
  return { ...presetAuto(c.write, c.mode), ...c.auto }
}

/** 하나씩 바꿔서 권한 이름의 기본값과 다른지 (화면의 「직접 정함」) */
export function autoCustom(c: { write: 'read' | 'notes'; mode: Mode; auto?: Partial<ChatAutoValues> }): boolean {
  const p = presetAuto(c.write, c.mode)
  const a = autoOf(c)
  return a.read !== p.read || a.run !== p.run || a.web !== p.web
}

/** 셈: 위가 더 무겁다. 여러 명령을 이으면 가장 무거운 것 */
const WEIGHT: Record<ChatKind, number> = { read: 0, edit: 1, run: 2, web: 3, delete: 4, outside: 5 }

const READS = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'find', 'fd', 'wc', 'sort', 'uniq', 'cut', 'tr', 'nl', 'echo', 'printf',
  'pwd', 'which', 'type', 'file', 'stat', 'du', 'df', 'diff', 'cmp', 'tree', 'jq', 'yq', 'basename', 'dirname', 'realpath', 'readlink', 'date', 'true', 'false',
  'cd', 'column', 'comm', 'md5', 'md5sum', 'shasum', 'sha256sum', 'xxd', 'hexdump', 'od', 'strings', 'env', 'printenv', 'whoami', 'uname', 'test', '[',
  'pdftotext', 'pdfinfo', 'sed', 'awk', 'read',
])
const EDITS = new Set(['mv', 'cp', 'mkdir', 'touch', 'tee', 'ln', 'patch', 'chmod'])
const DELETES = new Set(['rm', 'rmdir', 'unlink', 'shred', 'trash'])
const OUTSIDE = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync', 'sftp', 'ftp', 'nc', 'telnet', 'sudo', 'su', 'brew', 'apt', 'apt-get', 'port', 'gh', 'open', 'osascript', 'launchctl', 'kill', 'killall', 'pkill', 'crontab', 'docker'])
const GIT_READ = new Set(['log', 'diff', 'show', 'status', 'blame', 'branch', 'ls-files', 'rev-parse', 'grep', 'describe', 'shortlog', 'tag', 'remote', 'config', 'cat-file', 'ls-tree', 'reflog', 'merge-base', 'name-rev', 'whatchanged'])
const GIT_EDIT = new Set(['add', 'commit', 'mv', 'switch', 'merge', 'cherry-pick', 'revert', 'fetch', 'pull', 'rebase', 'apply', 'am', 'init'])
const GIT_DELETE = new Set(['rm', 'clean', 'reset', 'restore', 'checkout', 'stash'])
const GIT_OUTSIDE = new Set(['push', 'clone', 'submodule', 'worktree'])
/** 내려받아 까는 명령 (꾸러미 관리자의 하위 명령) */
const INSTALL = /^(install|i|add|remove|uninstall|update|upgrade|publish|link|global)$/

/**
 * 명령 앞의 말을 떼어 낸다: 환경 변수(A=1 cmd), 시간 재기 · env 같은 앞말, 셸의 묶음 말(then · do · ( · { · !).
 * 묶음 말을 떼지 않으면 `for f in a; do rm $f; done`의 rm이 「실행」으로만 보인다. for <이름> in <낱말> · fi · done은 돌리는 것이 없어 빈 것으로.
 * env = 다른 프로그램을 돌리게 할 수 있는 환경 변수가 붙었는지 (GIT_PAGER=… · LESSOPEN=… · PATH=…). 글 모양 변수만 그대로 둔다
 */
export function leading(words: string[]): { rest: string[]; env: boolean } {
  let w = words
  let env = false
  for (;;) {
    if (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!)) {
      if (!/^(LC_[A-Z]+|LANG|LANGUAGE|TZ|NO_COLOR|FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|COLUMNS|LINES|TERM)=/.test(w[0]!)) env = true
      w = w.slice(1)
    }
    else if (w.length && /^(time|nice|nohup|command|builtin|exec)$/.test(w[0]!)) {
      const timed = w[0] === 'time'
      w = w.slice(1)
      // time -p rm x: 옵션을 건너뛴다
      while (timed && w.length > 1 && /^-[plhav]+$/.test(w[0]!)) w = w.slice(1)
    }
    // 함수 정의의 머리(f() { … } · function f { … })를 뗀다: 몸의 명령을 본다
    else if (w.length > 1 && /^[A-Za-z_][\w-]*\(\)$/.test(w[0]!)) w = w.slice(1)
    else if (w.length > 2 && w[1] === '()' && /^[A-Za-z_][\w-]*$/.test(w[0]!)) w = w.slice(2)
    else if (w.length > 2 && w[0] === 'function' && /^[A-Za-z_][\w-]*(\(\))?$/.test(w[1]!)) w = w.slice(w[2] === '()' ? 3 : 2)
    // timeout 5 rm x · nice -n 5 rm x · caffeinate -i rm x · stdbuf -oL rm x: 옵션과 시간 값을 건너뛰고 뒤의 명령을 본다
    else if (w.length > 1 && /^(timeout|gtimeout|caffeinate|stdbuf)$/.test(w[0]!.split('/').pop()!)) {
      const timed = /timeout$/.test(w[0]!)
      w = w.slice(1)
      while (w.length && w[0]!.startsWith('-')) w = w.slice(/^-[kstw]$/.test(w[0]!) ? 2 : 1)
      if (timed && w.length && /^\d+(\.\d+)?[smhd]?$/.test(w[0]!)) w = w.slice(1)
    }
    else if (w.length > 1 && /^-n$/.test(w[0]!) && /^-?\d+$/.test(w[1]!)) w = w.slice(2)
    else if (w.length > 1 && w[0]!.split('/').pop() === 'env') { w = w.slice(1); while (w.length && w[0]!.startsWith('-')) w = w.slice(1) }
    else if (w.length && /^(if|then|else|elif|do|while|until|!|\{|\()$/.test(w[0]!)) w = w.slice(1)
    else if (w.length && /^[({]+[^({]/.test(w[0]!)) w = [w[0]!.replace(/^[({]+/, ''), ...w.slice(1)]
    else break
  }
  if (w.length && /^(fi|done|\}|\))$/.test(w[0]!)) return { rest: [], env }
  if (w[0] === 'for' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(w[1] ?? '') && (w.length === 2 || w[2] === 'in')) return { rest: [], env }
  // 묶음을 닫는 ) 는 떼어 낸다: (cd x && ls) 의 ls)
  while (w.length > 1 && /^[)}]+$/.test(w[w.length - 1]!)) w = w.slice(0, -1)
  // 짝이 없는 닫는 괄호만: 낱말 안에서 짝이 맞는 것(sh -c 'echo $(rm x)' 의 끝)은 그 낱말의 글이다
  const last = w[w.length - 1] ?? ''
  const extra = Math.min(last.split(')').length - last.split('(').length, /\)*$/.exec(last)![0].length)
  if (w.length && extra > 0 && extra < last.length) w = [...w.slice(0, -1), last.slice(0, -extra)]
  return { rest: w, env }
}

/**
 * 명령이 하는 일. inside(path)는 그 절대 경로가 프로젝트나 등록한 폴더 안인지 (cwd는 프로젝트 폴더).
 * 폴더 밖 경로를 건드리면 외부, 모르는 프로그램은 실행으로 본다
 */
type Where = { cwd: string; inside(abs: string): boolean; home?: string }

export function commandKind(cmd: string, o: Where): ChatKind {
  let worst: ChatKind = 'read'
  const bump = (k: ChatKind) => { if (WEIGHT[k] > WEIGHT[worst]) worst = k }
  // $( … ) · ` … ` 안의 명령도 본다 (겹친 것은 안쪽부터). 다 풀지 못하면 무엇을 돌리는지 모르니 실행으로
  const sub = substitutions(cmd, { proc: true })
  for (const part of sub.inner) bump(commandKind(part, o))
  if (sub.left) bump('run')
  const vars = new Map<string, string[]>()
  for (const seg of segments(sub.flat)) {
    const r = redirects(seg)
    // 쓰기 돌려보내기: > 파일 · 2> 파일 · &> 파일 (2>&1 · >/dev/null은 빼고)
    for (const target of r.out) if (target !== '/dev/null') bump(touchesOutside(target, o) ? 'outside' : 'edit')
    // 읽어 들이는 돌려보내기도 폴더 밖이면 외부 (cat < /etc/passwd)
    for (const target of r.in) if (touchesOutside(target, o)) bump('outside')
    for (const q of qualifiers(seg)) {
      const runs = qualifierRuns(q)
      if (runs.calls || runs.code.length) bump('run')
      for (const code of runs.code) bump(commandKind(code, o))
    }
    const all = words(r.rest)
    // 글자 그대로 적은 값의 변수는 그 값을 넣어서도 본다: for x in -delete; do find . $x; done
    const tried = variants(unmask(seg), vars)
    if (tried === null) bump('run')
    else for (const v of tried) bump(commandKind(v, o))
    noteVars(all, vars)
    bump(wordsKind(all, o, 0))
  }
  return worst
}

/** 낱말로 나눈 명령 하나가 하는 일: 앞말을 떼고, 감싸 돌리는 안의 명령(sh -c · find -exec · xargs · env …)도 끝까지 따라간다 */
function wordsKind(all: string[], o: Where, depth: number): ChatKind {
  let worst: ChatKind = 'read'
  const bump = (k: ChatKind) => { if (WEIGHT[k] > WEIGHT[worst]) worst = k }
  const lead = leading(all)
  if (lead.env) bump('run')
  const w = lead.rest
  if (!w.length) return worst
  // 프로그램과 인자는 진짜 글로 본다 (가린 글자를 되돌려서). 경로만 가린 채로: 작은따옴표 안의 $HOME 은 글자다
  const plain = w.map(unmask)
  const prog = plain[0]!.split('/').pop()!
  const args = plain.slice(1)
  bump(kindOf(prog, args))
  // 다른 명령을 감싸 돌리는 것은 안의 명령도 본다: 실행을 자동 허용해도 삭제 · 외부는 묻게 (bash -c "rm -rf x" · find -exec rm · eval).
  // 낱말로 받은 안의 명령도 같은 길로: find -exec sh -c 'rm …' · xargs env rm · find -exec nice rm (11/25 검토)
  const inner = wrapped(prog, args)
  if (depth > 5 && inner.length) bump('run')
  else for (const x of inner) bump(typeof x === 'string' ? commandKind(x, o) : wordsKind(x, o, depth + 1))
  // 폴더 밖 경로 (읽기라도 폴더 밖이면 외부)
  for (const a of w.slice(1)) { const v = pathPart(a); if (looksLikePath(v) && touchesOutside(v, o)) bump('outside') }
  if (prog === 'cd' && w[1] && touchesOutside(w[1], o)) bump('outside')
  return worst
}

/** 값을 넣어 볼 만한 낱말: 글자 그대로이고(변수 · 치환 · 무늬가 없고) 다시 읽어도 뜻이 바뀌지 않는 글자만 */
const LITERAL = /^[\w./:,@%+=-]+( [\w./:,@%+=-]+)*$/
/** for x in a b · x=a 를 적어 둔다. 값이 글자 그대로가 아니면 그 이름은 모르는 것으로 */
function noteVars(all: string[], vars: Map<string, string[]>): void {
  const w = /^(do|then|else|\{)$/.test(all[0] ?? '') ? all.slice(1) : all
  if (w[0] === 'for' && /^[A-Za-z_]\w*$/.test(w[1] ?? '') && w[2] === 'in') {
    const vals = w.slice(3)
    if (vals.length && vals.every((x) => LITERAL.test(x))) vars.set(w[1]!, vals); else vars.delete(w[1]!)
    return
  }
  if (!w.length || !w.every((x) => /^[A-Za-z_]\w*=/.test(x))) return
  for (const x of w) {
    const name = x.slice(0, x.indexOf('=')), value = x.slice(x.indexOf('=') + 1)
    if (LITERAL.test(value)) vars.set(name, [value]); else vars.delete(name)
  }
}
/** 적어 둔 변수($x · ${x} · zsh의 $=x · $~x)를 값으로 바꾼 글들. 쓰지 않으면 [], 너무 많으면 null */
function variants(text: string, vars: Map<string, string[]>): string[] | null {
  let out = [text]
  let hit = false
  for (const [name, vals] of vars) {
    const re = () => new RegExp(`\\$(?:[=~^]{0,2}${name}\\b|\\{[=~^]{0,2}${name}\\})`, 'g')
    if (!re().test(text)) continue
    hit = true
    out = out.flatMap((t) => vals.map((v) => t.replace(re(), v)))
    if (out.length > 16) return null
  }
  return hit ? out : []
}

/** 감싸 돌리는 안의 명령: 글 한 줄(sh -c · eval)이면 string, 낱말들(find -exec · xargs)이면 string[] */
export function wrapped(prog: string, args: string[]): (string | string[])[] {
  if (/^(sh|bash|zsh|dash|ksh|fish)$/.test(prog)) {
    const i = args.findIndex((a) => /^-[a-zA-Z]*c$/.test(a))
    return i >= 0 && args[i + 1] ? [args[i + 1]!] : []
  }
  if (prog === 'eval') return args.length ? [args.join(' ')] : []
  if (prog === 'find') {
    const out: string[][] = []
    for (let i = 0; i < args.length; i++) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(args[i]!)) continue
      // find는 「{} +」일 때만 +에서 끝난다: 홀로 선 +(sort -t + …) 뒤의 인자를 놓치지 않게
      const end = args.findIndex((a, j) => j > i && (a === ';' || (a === '+' && args[j - 1] === '{}')))
      const inner = args.slice(i + 1, end < 0 ? undefined : end)
      if (inner.length) out.push(inner)
    }
    return out
  }
  if (prog === 'xargs') {
    const inner = xargsCommand(args)
    return inner.length ? [inner] : []
  }
  return []
}

/** xargs 뒤의 명령: 값을 받는 옵션(-n 1 · -I {} · -P 4 …)의 값은 건너뛴다 */
function xargsCommand(args: string[]): string[] {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) i += /^-[nIPLsdEa]$/.test(args[i]!) ? 2 : 1
  return args.slice(i)
}

/** git의 전역 옵션(-C <폴더> · -c k=v 와 붙여 쓴 꼴 · 다른 -옵션)을 뗀, 하위 명령부터의 인자 */
function gitArgs(args: string[]): string[] {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) i += args[i] === '-C' || args[i] === '-c' ? 2 : 1
  return args.slice(i)
}

function kindOf(prog: string, args: string[]): ChatKind {
  if (prog === 'git') {
    // -C <폴더> · -c k=v 의 값은 하위 명령이 아니다: 건너뛰고 찾는다 (git -C . clean -fdx)
    const bare = gitArgs(args)
    if (bare.length !== args.length) {
      const k = kindOf('git', bare)
      // -c k=v 는 pager · 편집기 같은 프로그램을 바꿔 돌릴 수 있다: 읽는 하위 명령이어도 실행으로
      const config = args.slice(0, args.length - bare.length).some((a) => a === '-c' || a.startsWith('--config-env'))
      return config && WEIGHT[k] < WEIGHT.run ? 'run' : k
    }
    const sub = args.find((a) => !a.startsWith('-')) ?? ''
    if (GIT_OUTSIDE.has(sub)) return 'outside'
    if (GIT_DELETE.has(sub)) {
      // checkout <브랜치>는 바꾸기, checkout -- <파일> · reset --hard · restore는 고친 것을 버린다
      // checkout -f · checkout <커밋> <파일>도 고친 것을 버린다
      if (sub === 'checkout' && !args.includes('--') && !args.includes('.') && !args.some((a) => /^(-f|--force)$/.test(a)) && (args.filter((a) => !a.startsWith('-')).length <= 2 || args.some((a) => /^(-b|-B|-t|--track|--orphan)$/.test(a)))) return 'edit'
      if (sub === 'reset' && !args.includes('--hard')) return 'edit'
      if (sub === 'stash' && /^(list|show)$/.test(args[args.indexOf('stash') + 1] ?? '')) return 'read'
      return 'delete'
    }
    if (sub === 'switch' && args.some((a) => /^(-f|--force|--discard-changes)$/.test(a))) return 'delete'
    if (GIT_EDIT.has(sub)) return 'edit'
    // 읽는 하위 명령의 쓰는 쓰임: 가지 · 태그 지우기와 만들기, 설정 쓰기, 원격 바꾸기, --output 파일
    const rest = args.slice(args.indexOf(sub) + 1)
    const named = rest.filter((a) => !a.startsWith('-'))
    if (sub === 'branch' || sub === 'tag') {
      if (rest.some((a) => /^-[a-zA-Z]*[dD]/.test(a) || a === '--delete')) return 'delete'
      if (rest.some((a) => (sub === 'branch' ? /^-[a-zA-Z]*[mMcCfu]/ : /^-[a-zA-Z]*[asfmuF]/).test(a) || /^--(move|copy|force|set-upstream|unset-upstream|edit-description|annotate|sign)/.test(a))) return 'edit'
      if (named.length && !rest.some((a) => /^(-l|--list|--contains|--merged|--no-merged|--points-at|-n\d*|--sort)/.test(a))) return 'edit'
    }
    // 모든 저장소의 설정을 바꾸는 것은 폴더 밖이다
    if (sub === 'config' && rest.some((a) => /^--(global|system)$/.test(a)) && !rest.some((a) => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(a)) && named.length > 1) return 'outside'
    if (sub === 'config' && !rest.some((a) => /^(--get|--get-all|--get-regexp|--list|-l|--show-origin|--show-scope)$/.test(a)) && (named.length > 1 || rest.some((a) => /^--(unset|add|replace-all|remove-section|rename-section|edit)|^-e$/.test(a)))) return 'edit'
    if (sub === 'remote' && /^(add|remove|rm|rename|set-url|set-head|set-branches|prune|update)$/.test(named[0] ?? '')) return 'edit'
    // 다른 프로그램을 돌리는 옵션: grep -O<명령> · --ext-diff
    if (rest.some((a) => /^--(open-files-in-pager|ext-diff)(=|$)/.test(a)) || (sub === 'grep' && rest.some((a) => /^-[a-zA-Z]*O/.test(a)))) return 'run'
    if (rest.some((a) => /^--output(=|$)/.test(a))) return 'edit'
    if (GIT_READ.has(sub)) return 'read'
    return 'run'
  }
  // 읽는 프로그램이라도 파일을 쓰거나 다른 명령을 돌리는 쓰임은 읽기가 아니다 (11/20 보안 검토)
  const positional = args.filter((a) => !a.startsWith('-'))
  const shortHas = (ch: string) => args.some((a) => /^-[a-zA-Z]+/.test(a) && a.slice(1).includes(ch))
  // sed: -i와 w 명령(파일 쓰기)
  // -Ei · -ni처럼 붙여 쓴 꼴과 주소 뒤의 w(1,5w 파일 · $w 파일)도
  if (prog === 'sed') return args.some((a) => /^-[a-zA-Z]*i/.test(a) || /^--in-place/.test(a) || (!a.startsWith('-') && /(^|[;{}/\s\d$!])w\s+[^\s;]/.test(a))) ? 'edit' : 'read'
  // awk의 system() · 명령으로 잇기(| · getline) · 파일 쓰기는 실행으로
  if (prog === 'awk') return args.some((a) => /system\s*\(|getline|\|\s*"|"\s*\||print[^;}|]*>/.test(a)) ? 'run' : 'read'
  if (prog === 'find') {
    if (args.includes('-delete')) return 'delete'
    if (args.some((a) => /^-(exec|execdir|ok|okdir)$/.test(a))) return 'run'
    return args.some((a) => /^-(fprint|fprint0|fprintf|fls)$/.test(a)) ? 'edit' : 'read'
  }
  // rg --pre는 파일마다 그 명령을 돌린다
  if (prog === 'rg' && args.some((a) => /^--(pre|hostname-bin)(=|$)/.test(a))) return 'run'
  if (prog === 'sort' && args.some((a) => /^--compress-program/.test(a))) return 'run'
  if (prog === 'sort' && (shortHas('o') || args.some((a) => /^--output(=|$)/.test(a)))) return 'edit'
  if (prog === 'tree' && args.some((a) => /^-[a-zA-Z]*[oR]/.test(a))) return 'edit'
  if (prog === 'uniq' && positional.length > 1) return 'edit'
  if (prog === 'xxd' && shortHas('r')) return 'edit'
  if (prog === 'yq' && (shortHas('i') || args.some((a) => /^--inplace/.test(a)))) return 'edit'
  if (prog === 'pdftotext' && positional.length > 0 && positional[positional.length - 1] !== '-' && !args.includes('-')) return 'edit'
  if (prog === 'xargs') { const inner = xargsCommand(args); return inner.length ? kindOf(inner[0]!.split('/').pop()!, inner.slice(1)) : 'read' }
  if (READS.has(prog)) return 'read'
  if (EDITS.has(prog)) return 'edit'
  if (DELETES.has(prog)) return 'delete'
  if (OUTSIDE.has(prog)) return 'outside'
  if (/^(npm|pnpm|yarn|bun|pip|pip3|uv|conda|mamba|gem|cargo|go|julia|R)$/.test(prog)) {
    const sub = args.find((a) => !a.startsWith('-')) ?? ''
    if (INSTALL.test(sub) || (prog === 'julia' && args.some((a) => /Pkg\.add/.test(a)))) return 'outside'
  }
  if ((prog === 'python' || prog === 'python3') && args[0] === '-m' && /^pip$/.test(args[1] ?? '') && INSTALL.test(args[2] ?? '')) return 'outside'
  return 'run'
}

/** 옵션에 붙여 적은 경로도 본다: --file=/etc/x · -f/etc/x */
const pathPart = (a: string) => /^--?[A-Za-z][\w-]*=(.+)$/.exec(a)?.[1] ?? /^-[A-Za-z]([/~].+)$/.exec(a)?.[1] ?? a
/** 가운데의 ../ 로 폴더를 벗어나는 것도 본다 (sub/../../밖) */
const looksLikePath = (a: string) => a.startsWith('/') || a.startsWith('~') || a.startsWith('..') || a.includes('../') || a.endsWith('/..') || /^"?\$\{?HOME\b/.test(a)

function touchesOutside(p: string, o: Where): boolean {
  if (p === '/dev/null' || p.startsWith('/dev/std') || p.startsWith('/tmp/') || p === '/tmp') return false
  const home = o.home ?? ''
  const bare = p.replace(/^"/, '').replace(/^\$\{?HOME\}?/, '~')
  // ~다른사람 은 그 사람의 홈이다
  if (/^~[^/]/.test(bare)) return true
  const expanded = bare.startsWith('~') ? `${home}${bare.slice(1)}` : bare
  const abs = expanded.startsWith('/') ? expanded : `${o.cwd.replace(/\/$/, '')}/${expanded}`
  return !o.inside(normalize(abs))
}

/** /a/b/../c → /a/c (따로 path 모듈 없이, core는 브라우저에서도 돈다) */
function normalize(abs: string): string {
  const out: string[] = []
  for (const part of abs.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop(); else out.push(part)
  }
  return `/${out.join('/')}`
}

/** 실행 프로그램의 이름: 꾸러미 관리자 · 스크립트 도구는 하위 명령까지 (pnpm test · npm run build), git은 하위 명령까지 */
function programName(w: string[]): string {
  const prog = w[0]!.split('/').pop()!
  if (/^(npm|pnpm|yarn|bun|uv|make|cargo|go)$/.test(prog)) return [prog, ...w.slice(1).filter((a) => !a.startsWith('-')).slice(0, prog === 'npm' && w[1] === 'run' ? 2 : 1)].join(' ')
  if (prog === 'git') return ['git', gitArgs(w.slice(1)).find((a) => !a.startsWith('-')) ?? ''].join(' ').trim()
  return prog
}

/**
 * 명령 줄에서 읽기가 아닌 것을 하는 프로그램 모두 ($( ) 안도). 「늘」은 이 모두가 허락됐을 때만 묻지 않는다:
 * 첫 프로그램만 보면 「pnpm test 늘」이 `pnpm test && ./deploy.sh`도 묻지 않고 돌린다
 */
export function runPrograms(cmd: string): string[] {
  const out: string[] = []
  const sub = substitutions(cmd, { proc: true })
  for (const part of sub.inner) for (const p of runPrograms(part)) if (!out.includes(p)) out.push(p)
  for (const seg of segments(sub.flat)) {
    const all = words(redirects(seg).rest).map(unmask)
    const { rest: w, env } = leading(all)
    if (!w.length) continue
    const prog = w[0]!.split('/').pop()!
    const reads = kindOf(prog, w.slice(1)) === 'read'
    if (!env && reads) continue
    // 환경 변수를 붙여 돌리는 것은 그 변수 이름까지가 이름이다 (GIT_PAGER= git log)
    const name = env && reads ? `${all.filter((x) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x)).map((x) => x.slice(0, x.indexOf('=') + 1)).join(' ')} ${programName(w)}` : programName(w)
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/** 실행의 「늘」은 프로그램마다: 명령 줄에서 첫 실행 프로그램 이름 (pnpm test면 pnpm test) */
export function runProgram(cmd: string): string {
  return runPrograms(cmd)[0] ?? words(cmd)[0] ?? cmd
}
