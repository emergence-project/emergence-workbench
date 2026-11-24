/**
 * 에이전트 대화의 권한을 명령 대신 하는 일로 (10/28 사용자 결정, 시안 4절 "읽기 · 편집 · 실행 · 외부"):
 * 명령 한 줄이 무엇을 하는지 판정하고(commandKind), 권한 이름마다의 「자동 허용」 기본값(presetAuto)을 둔다.
 * 서버의 허락 판정(agentChats.ts judge)과 화면의 토글(AgentChats.tsx)이 함께 쓴다.
 */

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
 * 따옴표와 \\(다음 글자를 글자 그대로)를 지키며 낱말로 나눈다 (작은 셸 흉내, 해석하지 못하면 거칠게).
 * \\를 모르면 `echo \\" > 파일 \\"`의 > 가 따옴표 안으로 보여 판정을 빠져나간다 (11/20 보안 검토)
 */
export function words(seg: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  let any = false
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i]!
    if (q === "'") { if (ch === q) q = null; else cur += ch; continue }
    if (q) {
      if (ch === '\\' && /["\\$`]/.test(seg[i + 1] ?? '')) { cur += seg[++i]; continue }
      if (ch === q) q = null; else cur += ch
      continue
    }
    if (ch === '\\' && i + 1 < seg.length) { cur += seg[++i]; any = true; continue }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue }
    cur += ch
  }
  if (cur || any) out.push(cur)
  return out
}

/**
 * 명령 줄을 이음표(; && || | &, 줄바꿈)로 나눈다. 따옴표 안과 \\ 뒤 글자는 나누지 않는다.
 * 홀로 선 &(뒤에서 돌리기)도 나눈다: `ls & rm -rf x`의 뒤 명령을 놓치지 않게. 2>&1 · &> 의 &는 돌려보내기라 그대로 둔다
 */
export function segments(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (q) {
      cur += ch
      if (q === '"' && ch === '\\' && i + 1 < cmd.length) cur += cmd[++i]
      else if (ch === q) q = null
      continue
    }
    if (ch === '\\' && i + 1 < cmd.length) { cur += ch + cmd[++i]; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    const redirect = ch === '&' && (cmd[i + 1] === '>' || /[<>]$/.test(cur))
    if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && !redirect)) {
      out.push(cur); cur = ''
      if ((ch === '|' || ch === '&') && cmd[i + 1] === ch) i++
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * 작은따옴표 안의 $ ` ( ) 를 가린다: 셸은 그 안을 글자 그대로 읽으므로 치환이 아니다. 가리지 않으면 아래 정규식이
 * `echo '$(echo ' ; rm -rf x ; echo ')'`의 두 따옴표 글을 치환 하나로 짝지어, 그 사이의 명령을 통째로 가린다.
 * 문맥을 따라간다: 큰따옴표 안에서는 ' 가 글자지만, 그 안의 $( … ) 안에서는 다시 따옴표다
 */
function maskLiteral(cmd: string): string {
  let out = ''
  // 문맥 더미: p = 따옴표 밖(맨 바깥 · $( ) 안, 값은 열린 괄호 수), d = 큰따옴표 안, b = 백틱 안
  const stack: { k: 'p' | 'd' | 'b'; n: number }[] = [{ k: 'p', n: 0 }]
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!, top = stack.at(-1)!
    if (ch === '\\' && i + 1 < cmd.length) { out += ch + cmd[++i]; continue }
    if (ch === '$' && cmd[i + 1] === '(') { stack.push({ k: 'p', n: 0 }); out += '$('; i++; continue }
    if (ch === '`') { if (top.k === 'b') stack.pop(); else stack.push({ k: 'b', n: 0 }); out += ch; continue }
    if (top.k === 'd') { if (ch === '"') stack.pop(); out += ch; continue }
    if (ch === "'") {
      const end = cmd.indexOf("'", i + 1)
      out += `'${cmd.slice(i + 1, end < 0 ? undefined : end).replace(/[$\`()]/g, '_')}${end < 0 ? '' : "'"}`
      i = end < 0 ? cmd.length : end
      continue
    }
    if (ch === '"') stack.push({ k: 'd', n: 0 })
    else if (top.k === 'p' && ch === '(') top.n++
    else if (top.k === 'p' && ch === ')') { if (top.n > 0) top.n--; else if (stack.length > 1) stack.pop() }
    out += ch
  }
  return out
}

/** $( … ) · ` … ` 를 안쪽부터 하나씩 꺼내 자리표(SUBST)로 바꾼다. left = 다 풀지 못하고 남았는지 (짝이 안 맞거나 너무 깊다) */
export function substitutions(raw: string, o: { proc?: boolean } = {}): { inner: string[]; flat: string; left: boolean } {
  const cmd = maskLiteral(raw)
  const open = o.proc ? /[$<>]\(([^()`]*)\)|`([^`]*)`/ : /\$\(([^()`]*)\)|`([^`]*)`/
  const inner: string[] = []
  let flat = cmd
  for (let n = 0; n < 20; n++) {
    // proc: <( … ) · >( … ) 도 안의 명령을 돌린다 (cat <(rm x)가 읽기로 보이지 않게)
    const m = open.exec(flat)
    if (!m) break
    inner.push(m[1] ?? m[2] ?? '')
    flat = `${flat.slice(0, m.index)}SUBST${flat.slice(m.index + m[0].length)}`
  }
  return { inner, flat, left: (o.proc ? /[$<>]\(|`/ : /\$\(|`/).test(flat) }
}

/**
 * 명령 앞의 말을 떼어 낸다: 환경 변수(A=1 cmd), 시간 재기 · env 같은 앞말, 셸의 묶음 말(then · do · ( · { · !).
 * 묶음 말을 떼지 않으면 `for f in a; do rm $f; done`의 rm이 「실행」으로만 보인다. for <이름> in <낱말> · fi · done은 돌리는 것이 없어 빈 것으로.
 * env = 다른 프로그램을 돌리게 할 수 있는 환경 변수가 붙었는지 (GIT_PAGER=… · LESSOPEN=… · PATH=…). 글 모양 변수만 그대로 둔다
 */
function leading(words: string[]): { rest: string[]; env: boolean } {
  let w = words
  let env = false
  for (;;) {
    if (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!)) {
      if (!/^(LC_[A-Z]+|LANG|LANGUAGE|TZ|NO_COLOR|FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|COLUMNS|LINES|TERM)=/.test(w[0]!)) env = true
      w = w.slice(1)
    }
    else if (w.length && /^(time|nice|nohup|command|builtin|exec)$/.test(w[0]!)) w = w.slice(1)
    // timeout 5 rm x · nice -n 5 rm x · caffeinate -i rm x · stdbuf -oL rm x: 옵션과 시간 값을 건너뛰고 뒤의 명령을 본다
    else if (w.length > 1 && /^(timeout|gtimeout|caffeinate|stdbuf)$/.test(w[0]!.split('/').pop()!)) {
      const timed = /timeout$/.test(w[0]!)
      w = w.slice(1)
      while (w.length && w[0]!.startsWith('-')) w = w.slice(/^-[ks]$/.test(w[0]!) ? 2 : 1)
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
  if (w.length && /[^)]\)+$/.test(w[w.length - 1]!)) w = [...w.slice(0, -1), w[w.length - 1]!.replace(/\)+$/, '')]
  return { rest: w, env }
}

/**
 * 명령이 하는 일. inside(path)는 그 절대 경로가 프로젝트나 등록한 폴더 안인지 (cwd는 프로젝트 폴더).
 * 폴더 밖 경로를 건드리면 외부, 모르는 프로그램은 실행으로 본다
 */
export function commandKind(cmd: string, o: { cwd: string; inside(abs: string): boolean; home?: string }): ChatKind {
  let worst: ChatKind = 'read'
  const bump = (k: ChatKind) => { if (WEIGHT[k] > WEIGHT[worst]) worst = k }
  // $( … ) · ` … ` 안의 명령도 본다 (겹친 것은 안쪽부터). 다 풀지 못하면 무엇을 돌리는지 모르니 실행으로
  const sub = substitutions(cmd, { proc: true })
  for (const part of sub.inner) bump(commandKind(part, o))
  if (sub.left) bump('run')
  for (const seg of segments(sub.flat)) {
    // 쓰기 돌려보내기: > 파일 · 2> 파일 · &> 파일 (2>&1 · >/dev/null은 빼고)
    for (const m of seg.matchAll(/>>?\|?(?:&(?!(?:\d+|-)(?=[\s;&|)<>]|$)))?\s*([^\s;&|<>]+)/g)) {
      const target = m[1]!
      if (target === '/dev/null') continue
      bump(touchesOutside(target, o) ? 'outside' : 'edit')
    }
    let w = words(seg.replace(/(?:\d|&)?>>?\|?&?\s*[^\s<>]+/g, ' ').replace(/<\s*\S+/g, ' '))
    const lead = leading(w)
    if (lead.env) bump('run')
    w = lead.rest
    if (!w.length) continue
    const prog = w[0]!.split('/').pop()!
    const args = w.slice(1)
    bump(kindOf(prog, args))
    // 다른 명령을 감싸 돌리는 것은 안의 명령도 본다: 실행을 자동 허용해도 삭제 · 외부는 묻게 (bash -c "rm -rf x" · find -exec rm · eval)
    for (const inner of wrapped(prog, args)) bump(typeof inner === 'string' ? commandKind(inner, o) : kindOf(inner[0]!.split('/').pop()!, inner.slice(1)))
    // 폴더 밖 경로 (읽기라도 폴더 밖이면 외부)
    for (const a of args) { const v = pathPart(a); if (looksLikePath(v) && touchesOutside(v, o)) bump('outside') }
    if (prog === 'cd' && args[0] && touchesOutside(args[0], o)) bump('outside')
  }
  return worst
}

/** 감싸 돌리는 안의 명령: 글 한 줄(sh -c · eval)이면 string, 낱말들(find -exec · xargs)이면 string[] */
function wrapped(prog: string, args: string[]): (string | string[])[] {
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

function touchesOutside(p: string, o: { cwd: string; inside(abs: string): boolean; home?: string }): boolean {
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
    const all = words(seg.replace(/(?:\d|&)?>>?\|?&?\s*[^\s<>]+/g, ' ').replace(/<\s*\S+/g, ' '))
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
