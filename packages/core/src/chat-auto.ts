/**
 * 에이전트 대화의 권한을 명령 대신 하는 일로 (10/28 사용자 결정, 시안 4절 "읽기 · 편집 · 실행 · 외부"):
 * 명령 한 줄이 무엇을 하는지 판정하고(commandKind), 권한 이름마다의 「자동 허용」 기본값(presetAuto)을 둔다.
 * 서버의 허락 판정(agentChats.ts judge)과 화면의 토글(AgentChats.tsx)이 함께 쓴다.
 */
import { alternatives, certainHeredoc, evalFlags, expandBraces, expandWords, hasBraces, heredocVariants, longOpt, qualifierRuns, qualifiers, redirects, segments, splitGroups, substitutions, unmask, words } from './chat-shell.js'
import { ghReadRemoved } from './chat-gh.js'
import { uniqNames } from './chat-readonly.js'
import { sedWrites } from './chat-sed.js'
import { VarWatch } from './chat-vars.js'
import { codeSpawns, codeTouchesOutside } from './chat-pycode.js'
import { gitOutside, looksLikePath, pathPart, pathWord, pathWords } from './chat-place.js'

// 셸 글 읽기는 chat-shell.ts로 옮겼다: 여기서 가져다 쓰던 곳을 위해 그대로 내보낸다
export { bare, joinLines, prepare, redirects, segments, substitutions, unmask, words } from './chat-shell.js'

export type ChatKind = 'read' | 'edit' | 'delete' | 'run' | 'web' | 'outside'
export interface ChatAutoValues { read: boolean; run: boolean; web: boolean }

type Mode = 'ask' | 'plan' | 'edit' | 'auto'
/** 권한 이름(읽기 전용 · 수동 · 계획 · 편집 자동 수락 · 자동)의 토글 기본값. 편집은 모드가 정한다. 자동은 셋 다 켠다 (11/23) */
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

export const READS = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'find', 'fd', 'wc', 'sort', 'uniq', 'cut', 'tr', 'nl', 'echo', 'printf',
  'pwd', 'which', 'type', 'file', 'stat', 'du', 'df', 'diff', 'cmp', 'tree', 'jq', 'yq', 'basename', 'dirname', 'realpath', 'readlink', 'date', 'true', 'false',
  'cd', 'column', 'comm', 'md5', 'md5sum', 'shasum', 'sha256sum', 'xxd', 'hexdump', 'od', 'strings', 'env', 'printenv', 'whoami', 'uname', 'test', '[',
  'pdftotext', 'pdfinfo', 'sed', 'awk', 'read',
])
export const EDITS = new Set(['mv', 'cp', 'mkdir', 'touch', 'tee', 'ln', 'patch', 'chmod'])
export const DELETES = new Set(['rm', 'rmdir', 'unlink', 'shred', 'trash'])
export const OUTSIDE = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync', 'sftp', 'ftp', 'nc', 'telnet', 'sudo', 'su', 'brew', 'apt', 'apt-get', 'port', 'gh', 'open', 'osascript', 'launchctl', 'kill', 'killall', 'pkill', 'crontab', 'docker'])
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
export function leading(all: string[]): { rest: string[]; env: boolean } {
  let w = all
  let env = false
  for (;;) {
    if (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!)) {
      if (!/^(LC_[A-Z]+|LANG|LANGUAGE|TZ|NO_COLOR|FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|COLUMNS|LINES|TERM)=/.test(w[0]!)) env = true
      w = w.slice(1)
    }
    // 앞말은 경로로 적어도(/usr/bin/time), 옵션이 붙어도(command -p · nohup -- · nice -10 · exec -a 이름) 뗀다 (11/25 검토)
    // zsh의 앞말 noglob · nocorrect · - 도 뒤의 명령을 그대로 돌린다
    else if (w.length > 1 && w[0] === '-') w = w.slice(1)
    else if (w.length && /^(time|nice|nohup|command|builtin|exec|noglob|nocorrect)$/.test(w[0]!.split('/').pop()!)) {
      const lookup = w[0]!.split('/').pop() === 'command' && /^-[vV]+$/.test(w[1] ?? '')
      w = w.slice(1)
      // command -v 이름 은 찾아보기만 한다
      if (lookup) return { rest: ['type', ...w.slice(1)], env }
      while (w.length > 1 && w[0]!.startsWith('-')) w = w.slice(/^-[na]$/.test(w[0]!) && w.length > 2 ? 2 : 1)
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
    else if (w.length > 1 && w[0]!.split('/').pop() === 'env') {
      // 옵션을 자리로 건너뛴다 (하나 뗄 때마다 낱말을 통째로 베끼면 옵션 수의 제곱만큼 걸린다)
      let at = 1
      let splits = 0
      while (at < w.length && w[at]!.startsWith('-')) {
        // env -S'rm -rf x' · -S 'rm -rf x': 그 글을 낱말로 쪼개 돌린다 (몇 번까지만). 쪼갠 것이 다시 옵션이면 계속 뗀다: env -S -- git push
        const split = splits < 8 ? /^(?:-[a-zA-Z]*S|--split-string=?)(.*)$/s.exec(w[at]!) : null
        if (split) { splits++; w = [...words(split[1] || (w[at + 1] ?? '')), ...w.slice(at + (split[1] ? 1 : 2))]; at = 0; continue }
        at += /^-[uCP]$/.test(w[at]!) ? 2 : 1
      }
      w = w.slice(at)
    }
    // repeat 3 명령 · =rm (zsh: 그 프로그램의 경로) · 이름 없는 함수 () { … } · case 값 in 무늬) 명령
    else if (w.length > 2 && w[0] === 'repeat') w = w.slice(2)
    else if (w.length && /^=[A-Za-z_][\w.-]*$/.test(w[0]!)) w = [w[0]!.slice(1), ...w.slice(1)]
    else if (w.length > 1 && w[0] === '()') w = w.slice(1)
    else if (w.length > 3 && w[0] === 'case' && w[2] === 'in') w = w.slice(3)
    else if (w.length > 1 && /^\(?[^()\s]*\)$/.test(w[0]!)) w = w.slice(1)
    else if (w.length > 2 && w[1] === ')') w = w.slice(2)
    else if (w.length && /^(if|then|else|elif|do|while|until|always|coproc|!|\{|\()$/.test(w[0]!)) w = w.slice(1)
    else if (w.length && /^[({]+[^({]/.test(w[0]!)) w = [w[0]!.replace(/^[({]+/, ''), ...w.slice(1)]
    else break
  }
  if (w.length && /^(fi|done|esac|\}|\))$/.test(w[0]!)) return { rest: [], env }
  // 머리만 있는 것: f() · function f · case 값 in
  if ((w.length === 1 && /^[A-Za-z_][\w-]*\(\)$/.test(w[0]!)) || (w[0] === 'function' && w.length <= 3) || (w[0] === 'case' && w[2] === 'in' && w.length === 3)) return { rest: [], env }
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
 * 명령이 하는 일. inside(path, raw)는 그 절대 경로가 프로젝트나 등록한 폴더 안인지 (cwd는 프로젝트 폴더, raw = .. 를 풀기 전의 글).
 * 폴더 밖 경로를 건드리면 외부, 모르는 프로그램은 실행으로 본다. slashes: / 가 든 낱말도 본다 (서버가 실제 파일로, 11/27)
 */
type Where = { cwd: string; inside(abs: string, raw?: string): boolean; home?: string; slashes?: boolean }

/** 치환이 겹친 깊이의 한도: 넘으면 따라가지 않고 가장 무겁게 본다 */
const DEPTH_MAX = 40
/** 한 줄에서 변수에 값을 넣어 다시 판정하는 횟수의 한도 */
export const VARIANTS_MAX = 600

/**
 * 확실한 히어독의 본문이 셸 명령으로 돌 수 없는가. cat: 받는 줄에 | 가 없을 때(있으면 본문이 다른 프로그램으로 간다).
 * python: 다른 프로그램을 돌리는 코드(os.system · subprocess · exec …)가 없고, 출력을 받는 프로그램이 읽기만 할 때
 * (python3 - <<E | sh 는 문자열 속 글이 실제로 돈다, 11/26)
 */
const bodyIsNotShell = (hd: NonNullable<ReturnType<typeof certainHeredoc>>) => (hd.prog === 'cat' ? !hd.piped : hd.reader && !codeSpawns(hd.body))

/**
 * cat 이 받는 확실한 히어독의 본문(자료)을 뺀 명령 글 (11/26): 명령 글 전체를 읽는 다른 판정(앱이 맡는 일 · 크리티컬 · 비밀)이 메모에 든 글에 걸리지 않게.
 * python 이 받는 본문은 빼지 않는다: 코드는 파일을 스스로 읽고 프로그램을 스스로 돌리며, 그 길을 다 알아낼 수 없다
 * (o = os; o.system(…) · pydoc.pipepager · 전각 글자 이름이 codeSpawns 를 지나갔다, 다섯째 검토)
 */
export function heredocBodiesRemoved(cmd0: string): string {
  let cmd = cmd0
  for (let n = 0; n < 20; n++) {
    const hd = certainHeredoc(cmd)
    if (!hd || hd.prog !== 'cat' || hd.piped) break
    cmd = hd.rest ? `${hd.head}\n${hd.rest}` : hd.head
  }
  return cmd
}

export function commandKind(cmd0: string, o: Where, depth = 0): ChatKind {
  // 확실한 히어독(certainHeredoc)을 cat 이나 python 이 받으면 본문은 셸 명령이 아니다 (11/26 "heredoc 본문 오탐"): 본문을 빼고 판정한다.
  // cat 은 본문을 자료로 받는다(받는 줄에 | 가 있으면 본문이 다른 프로그램으로 가므로 빼지 않는다). python 은 코드로 받는다: 셸 글로 읽지 않고
  // 폴더 밖을 가리키는 글만 본다(codeTouchesOutside). 그 밖의 프로그램(sh · bash · tee · 묶음 …)과 확실하지 않은 꼴은 전처럼 본문도 읽는다.
  // 쓴 파일을 뒤에서 돌리는 것(cat > x.sh <<E … ; sh x.sh)은 쓰기 도구로 쓰고 돌리는 것과 같다: 파일의 내용은 여기서 보지 않는다
  let cmd = cmd0
  let code: ChatKind = 'read'
  for (let n = 0; depth === 0 && n < 20; n++) {
    const hd = certainHeredoc(cmd)
    if (!hd || !bodyIsNotShell(hd)) break
    if (hd.prog === 'python' && codeTouchesOutside(hd.body, o, (p) => touchesOutside(p, o))) code = 'outside'
    cmd = hd.rest ? `${hd.head}\n${hd.rest}` : hd.head
  }
  // 확실한 gh 읽기 명령(ghReadRemoved)은 「외부」가 아니라 「웹 보기」다 (11/26): 그 명령만 빼고 나머지를 전처럼 판정한다
  let ghRead = false
  for (let n = 0; depth === 0 && n < 8; n++) {
    const without = ghReadRemoved(cmd)
    if (without === null) break
    cmd = without
    ghRead = true
  }
  // 값을 모르는 변수 (VarWatch): 맨 바깥 글에서만 본다. 값을 넣어 다시 읽는 글(variants)에서는 아직 넣지 않은 변수가 모르는 변수로 보인다
  const watch = depth === 0 ? new VarWatch() : undefined
  let kind = kindCore(cmd, o, depth, watch)
  const unknownVar = !!watch?.hit
  if (WEIGHT[code] > WEIGHT[kind]) kind = code
  // 히어독으로도 읽어 보고 무거운 쪽을 쓴다 (본문의 따옴표가 뒤 명령을 가리는 꼴, 본문에서 펼쳐지는 $( … ))
  // (겹친 깊이마다 여러 번 읽으면 일이 곱절로 불어나므로 바깥 몇 겹에서만. 안쪽의 히어독은 바깥에서 읽을 때 함께 읽힌다)
  for (const alt of depth < 3 ? heredocVariants(cmd).slice(0, depth === 0 ? 4 : 1) : []) {
    const other = kindCore(alt, o, depth)
    if (WEIGHT[other] > WEIGHT[kind]) kind = other
  }
  // 나머지가 읽기뿐일 때만 「웹 보기」다. 다른 일(실행 · 편집 · 삭제)이 이어진 줄은 전처럼 「외부」로 둔다:
  // 한 줄의 판정은 하나라, 「웹 보기」로 올리면 웹 보기만 켠 대화에서 그 실행 · 편집까지 묻지 않고 지나간다 (gh pr view 1; sh f)
  // 값을 모르는 변수: 모든 읽기를 합친 판정이 읽기 · 실행 · 웹 보기일 때만 「외부」로 올려 한 번 묻는다. 편집 · 삭제인 줄은 그대로 둔다
  // (읽기 전용 대화는 편집 · 삭제를 막고 외부는 묻는다: 올리면 막던 것이 묻는 것으로 풀린다. 읽기마다 올리면 다른 읽기의 삭제를 가린다, 11/26 검토)
  if (unknownVar && (kind === 'read' || kind === 'run' || kind === 'web')) kind = 'outside'
  if (ghRead) return kind === 'read' ? 'web' : 'outside'
  return kind
}

function kindCore(cmd: string, o: Where, depth: number, watch?: VarWatch): ChatKind {
  if (depth > DEPTH_MAX) return 'outside'
  let worst: ChatKind = 'read'
  const bump = (k: ChatKind) => { if (WEIGHT[k] > WEIGHT[worst]) worst = k }
  // $( … ) · ` … ` 안의 명령도 본다 (겹친 것은 안쪽부터). 다 풀지 못하면 무엇을 돌리는지 모르니 실행으로
  const sub = substitutions(cmd, { proc: true })
  for (const part of sub.inner) bump(commandKind(part, o, depth + 1))
  if (sub.left) bump('run')
  const vars = new Map<string, string[]>()
  // 묶음 안에서 정한 값 (noteGroupVars): 따로 적고 따로 센다
  const groupVars = new Map<string, string[]>()
  let groupBudget = GROUP_BUDGET
  // 변수에 값을 넣어 보는 횟수의 한도 (줄 전체에서): 값이 수백 개인 변수를 수백 번 쓰면 그 곱만큼 다시 판정하게 된다
  let budget = VARIANTS_MAX
  for (const seg of segments(sub.flat)) {
    const r = redirects(seg)
    // 쓰기 돌려보내기: > 파일 · 2> 파일 · &> 파일 (2>&1 · >/dev/null은 빼고)
    for (const target of r.out) if (target !== '/dev/null') bump(touchesOutside(target, o) ? 'outside' : 'edit')
    // 읽어 들이는 돌려보내기도 폴더 밖이면 외부 (cat < /etc/passwd)
    for (const target of r.in) if (touchesOutside(target, o)) bump('outside')
    for (const q of qualifiers(seg)) {
      const runs = qualifierRuns(q)
      if (runs.calls || runs.code.length) bump('run')
      for (const code of runs.code) bump(commandKind(code, o, depth + 1))
    }
    const all = words(r.rest)
    // 글자 그대로 적은 값의 변수는 그 값을 넣어서도 본다: for x in -delete; do find . $x; done
    const tried = variants(unmask(seg), vars, Math.min(256, budget))
    // 다 넣어 보지 못했으면(짝이 너무 많다 · 한도를 다 썼다) 무엇이 될지 모르니 실행으로
    if (tried.partial) bump('run')
    for (const v of tried.texts) bump(commandKind(v, o, depth + 1))
    budget = Math.max(0, budget - tried.texts.length)
    // 값을 모르는 변수가 find · git · sed · fd 의 인자 맨 앞에 오는지 적어 둔다 (11/26). 묶음으로 나눈 명령도 본다
    watch?.see(all, [all, ...splitGroups(all)].map((g) => leading(g).rest), unmask, (n) => vars.get(n) ?? groupVars.get(n))
    noteVars(all, vars)
    // 묶음 안에서 정한 값으로도 넣어 본다. 위에서 이미 본 글은 다시 보지 않는다
    if (groupBudget > 0) {
      const again = variants(unmask(seg), groupVars, Math.min(GROUP_TRIES, groupBudget)).texts.filter((v) => !tried.texts.includes(v))
      for (const v of again) bump(commandKind(v, o, depth + 1))
      groupBudget -= again.length
    }
    noteGroupVars(all, groupVars)
    // for x in /etc/*: 도는 낱말이 폴더 밖이면 그 변수를 읽는 것도 밖이다
    if (all[0] === 'for' && all[2] === 'in') for (const x of expandWords(all.slice(3))) { const v = pathPart(x); if (pathWord(v, o.slashes) && touchesOutside(v, o)) bump('outside') }
    // zsh의 ${(e)…}: 값을 한 번 더 펼친다 (안의 $( … )가 돈다)
    for (const text of evalFlags(seg)) { bump('run'); bump(commandKind(text, o, depth + 1)) }
    // 묶음으로도 나눠 보고(`{ true } always { rm x }`), 나누지 않고도 본다(인자로 쓴 { 는 낱말이다: rm a { b)
    bump(wordsKind(all, o, 0, depth))
    for (const group of splitGroups(all)) bump(wordsKind(group, o, 0, depth))
  }
  return worst
}

/** 낱말로 나눈 명령 하나가 하는 일: 앞말을 떼고, 감싸 돌리는 안의 명령(sh -c · find -exec · xargs · env …)도 끝까지 따라간다 */
function wordsKind(all: string[], o: Where, depth: number, outer: number): ChatKind {
  let worst: ChatKind = 'read'
  const bump = (k: ChatKind) => { if (WEIGHT[k] > WEIGHT[worst]) worst = k }
  const lead = leading(all)
  if (lead.env) bump('run')
  const w = lead.rest
  if (!w.length) return worst
  // 프로그램과 인자는 진짜 글로 본다 (가린 글자를 되돌려서). 경로만 가린 채로: 작은따옴표 안의 $HOME 은 글자다
  // 셸이 펼쳐 만들 수 있는 낱말(중괄호 · 기본값 · 빈 변수)로도 보고, 적힌 그대로도 본다: find . -{delete,print} · cat {/etc/passwd,}
  for (const ew of alternatives(w, depth === 0 && outer === 0)) {
    // 프로그램과 인자는 진짜 글로 본다 (가린 글자를 되돌려서). 경로만 가린 채로: 작은따옴표 안의 $HOME 은 글자다
    const plain = ew.map(unmask)
    const prog = (plain[0] ?? '').split('/').pop()!
    const args = plain.slice(1)
    bump(kindOf(prog, args))
    // 다른 명령을 감싸 돌리는 것은 안의 명령도 본다: 실행을 자동 허용해도 삭제 · 외부는 묻게 (bash -c "rm -rf x" · find -exec rm · eval).
    // 낱말로 받은 안의 명령도 같은 길로: find -exec sh -c 'rm …' · xargs env rm · find -exec nice rm (11/25 검토)
    const inner = wrapped(prog, args)
    if (depth > 5 && inner.length) bump('run')
    else for (const x of inner) bump(typeof x === 'string' ? commandKind(x, o, outer + 1) : wordsKind(x, o, depth + 1, outer))
    // 폴더 밖 경로 (읽기라도 폴더 밖이면 외부)
    for (const v of pathWords(ew.slice(1), o.slashes)) if (touchesOutside(v, o)) bump('outside')
    // 따옴표 친 빈칸이 든 중괄호도 펼쳐 본다 (11/26): cat {/etc/passwd,"a b"} 는 따옴표를 벗기면 빈칸이 든 낱말이라 펼치지 않았다
    // (코드를 받는 프로그램의 낱말은 빼고: awk '{print $1,/x/}' 의 /x/ 는 경로가 아니다. 많이 펼쳐진다고 밖으로 보지는 않는다: 따옴표 친 JSON이 흔하다)
    if (!CODE_ARG.test(prog)) for (const a of ew.slice(1)) if (a.includes('{') && /[\s"]/.test(a)) {
      for (const piece of expandBraces([a], true)) { const v = pathPart(piece); if (piece !== a && looksLikePath(v) && touchesOutside(v, o)) bump('outside') }
    }
    if (prog === 'cd' && ew[1] && touchesOutside(ew[1], o)) bump('outside')
  }
  return worst
}

/** 값을 넣어 볼 만한 낱말: 글자 그대로이고(변수 · 치환 · 무늬가 없고) 다시 읽어도 뜻이 바뀌지 않는 글자만 */
const LITERAL = /^[\w./:,@%+=-]+( [\w./:,@%+=-]+)*$/
/** for x in a b · x=a 를 적어 둔다. 값이 글자 그대로가 아니면 그 이름은 모르는 것으로 */
export function noteVars(all: string[], vars: Map<string, string[]>): void {
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
/** 묶음 안의 값으로 넣어 볼 때의 한도 (조각마다 · 줄 전체) */
export const GROUP_TRIES = 16
export const GROUP_BUDGET = 64
const GROUP_HEAD = /^(do|then|else|elif|if|while|until|always|\{|\(|\(\)|!)$/
/**
 * 묶음 안에서 정한 값도 적는다 (11/26): `(f=--force; git push origin main $f)` · `( for x in -delete; do find . $x; done )` · `() { x=-delete; find . $x }`.
 * noteVars의 표와는 따로 둔다: 여기 것은 더하기만 하고(지우지 않는다) 따로 넣어 보므로, 원래 판정과 그 한도에는 손대지 않는다
 * (묶음 안의 값은 밖에서 쓰이지 않을 수도 있다. 그럴 수도 있는 값으로 한 번 더 볼 뿐이다)
 */
export function noteGroupVars(all: string[], vars: Map<string, string[]>): void {
  // 묶음 밖에서 정한 것(noteVars가 읽는 꼴)은 noteVars처럼 값을 바꾼다: 다시 정한 이름의 옛 값으로는 보지 않는다 (f=--force; f=; git push $f)
  const plain = /^(do|then|else|\{)$/.test(all[0] ?? '') ? all.slice(1) : all
  if (noteInto(plain, vars, false)) return
  let w = all
  for (let n = 0; n < 16; n++) {
    if (GROUP_HEAD.test(w[0] ?? '') || /^[A-Za-z_][\w-]*\(\)$/.test(w[0] ?? '')) w = w.slice(1)
    else if (w[0] === 'function' && w.length > 1) w = w.slice(w[2] === '()' ? 3 : 2)
    else if (/^[({]+[^({)]/.test(w[0] ?? '')) w = [w[0]!.replace(/^[({]+/, ''), ...w.slice(1)]
    else break
  }
  while (w.length > 1 && /^[)}]+$/.test(w[w.length - 1]!)) w = w.slice(0, -1)
  if (w.length) w = [...w.slice(0, -1), w[w.length - 1]!.replace(/[)}]+$/, '')].filter(Boolean)
  // 묶음 안에서 정한 것은 더하기만 한다: 묶음 밖에서는 바깥 값이 그대로다
  noteInto(w, vars, true)
}
/** for x in … · x=… 를 적는다. merge = 앞의 값에 더한다(지우지 않는다), 아니면 바꾼다. 그런 꼴이었으면 true */
function noteInto(w: string[], vars: Map<string, string[]>, merge: boolean): boolean {
  const put = (name: string, vals: string[]) => {
    if (!vals.length) { if (!merge) vars.delete(name); return }
    // 새 값을 앞에 둔다: 한도를 넘으면 오래된 값부터 버린다
    if (vars.size < 64 || vars.has(name)) vars.set(name, merge ? [...new Set([...vals, ...(vars.get(name) ?? [])])].slice(0, 16) : vals.slice(0, 16))
  }
  if (w[0] === 'for' && /^[A-Za-z_]\w*$/.test(w[1] ?? '') && w[2] === 'in') {
    const vals = w.slice(3)
    put(w[1]!, merge ? vals.filter((x) => LITERAL.test(x)) : vals.length && vals.every((x) => LITERAL.test(x)) ? vals : [])
    return true
  }
  if (!w.length || !w.every((x) => /^[A-Za-z_]\w*=/.test(x))) return false
  for (const x of w) { const value = x.slice(x.indexOf('=') + 1); put(x.slice(0, x.indexOf('=')), LITERAL.test(value) ? [value] : []) }
  return true
}
/**
 * 적어 둔 변수($x · ${x} · zsh의 $=x · $~x)를 값으로 바꾼 글들 (쓰지 않으면 없음).
 * 짝이 너무 많으면 변수 하나씩만 바꾼 글들을 주고 partial = true: 다 넣어 본 것이 아니다
 */
export function variants(text: string, vars: Map<string, string[]>, limit = 256): { texts: string[]; partial: boolean } {
  if (!vars.size || !text.includes('$')) return { texts: [], partial: false }
  const re = (name: string) => new RegExp(`\\$(?:[=~^]{0,2}${name}\\b|\\{[=~^]{0,2}${name}\\})`, 'g')
  const used = [...vars].filter(([name]) => re(name).test(text))
  let out = [text]
  for (const [name, vals] of used) {
    // 곱하기 전에 센다: 넘으면 변수 하나씩만 바꾼 글 몇 개로
    if (out.length * vals.length > limit) return { texts: used.flatMap(([n, vs]) => vs.slice(0, 64).map((v) => text.replace(re(n), v))).slice(0, Math.min(limit, 128)), partial: true }
    out = out.flatMap((t) => vals.map((v) => t.replace(re(name), v)))
  }
  return { texts: used.length ? out : [], partial: false }
}

/** 감싸 돌리는 안의 명령: 글 한 줄(sh -c · eval)이면 string, 낱말들(find -exec · xargs)이면 string[] */
export function wrapped(prog: string, args: string[]): (string | string[])[] {
  if (/^(sh|bash|zsh|dash|ksh|fish)$/.test(prog)) {
    // -c 는 다른 글자와 붙여 쓰기도 하고(-ce · -lc), 뒤에 -- 를 두기도 한다
    const i = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a))
    // 명령 글은 -c 뒤의 낱말인데 사이에 옵션과 그 값이 낄 수 있다(bash -c -o errexit '…' · zsh -c -- '- …'):
    // 옵션 모양이 아닌 낱말을 모두 명령 글로 읽어 본다 (뒤의 $0 · $1 값도 읽히지만 더 무거워질 뿐이다)
    return i < 0 ? [] : args.slice(i + 1).filter((a) => a && a !== '--' && !/^[-+][a-zA-Z]+$/.test(a) && !/^--[\w-]+$/.test(a))
  }
  // eval eval … 은 한 번의 eval과 같다 (겹친 만큼 깊이 들어가지 않게)
  if (prog === 'eval') { const rest = args.slice(args.findIndex((x) => x !== 'eval')); return rest.length && rest[0] !== 'eval' ? [rest.join(' ')] : [] }
  if (prog === 'find') {
    const out: string[][] = []
    for (let i = 0; i < args.length; i++) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(args[i]!)) continue
      // find는 「{} +」일 때만 +에서 끝난다: 홀로 선 +(sort -t + …) 뒤의 인자를 놓치지 않게
      const end = args.findIndex((a, j) => j > i && (a === ';' || (a === '+' && args[j - 1] === '{}')))
      const inner = args.slice(i + 1, end < 0 ? undefined : end)
      if (inner.length) out.push(inner)
      // -exec 가 터무니없이 많으면 하나씩 보지 않고 지우는 것으로 본다 (낱말 수의 제곱만큼 걸린다)
      if (out.length > 64) return [['rm']]
    }
    return out
  }
  if (prog === 'xargs') {
    const inner = xargsCommand(args)
    return inner.length ? [inner] : []
  }
  // fd -x 명령 · -X 명령 (11/26): 찾은 파일마다(-X는 한꺼번에) 그 명령을 돌린다. 명령은 ; 나 끝까지
  if (prog === 'fd' || prog === 'fdfind') {
    const out: string[][] = []
    for (let i = 0; i < args.length; i++) {
      const m = /^(?:--exec(?:-batch)?(?:=(.*))?|-[HILsiapgFlu0]*[xX](.*))$/.exec(args[i]!)
      if (!m) continue
      const end = args.findIndex((a, j) => j > i && a === ';')
      // 붙여 쓴 명령(--exec=rm · -xrm)은 그 글이 첫 낱말이다
      const inner = [...(m[1] || m[2] ? [m[1] || m[2]!] : []), ...args.slice(i + 1, end < 0 ? undefined : end)]
      if (inner.length) out.push(inner)
      // 너무 많으면 하나씩 보지 않고 지우는 것으로 본다 (find -exec 와 같게)
      if (out.length > 16) return [['rm', '-rf']]
    }
    return out
  }
  return []
}
/** fd가 명령을 돌리는 옵션: -x · -X · --exec · --exec-batch 와 붙여 쓴 꼴(--exec=rm · -xrm · -Hx). 값을 받는 옵션 뒤의 x(-tx: 실행 파일만)는 아니다 */
export const FD_EXEC = /^(--exec(-batch)?(=.*)?|-[HILsiapgFlu0]*[xX].*)$/
/** 코드 · 무늬를 낱말로 받는 프로그램: 그 낱말의 중괄호는 셸이 펼치는 것이 아닐 때가 많다 */
const CODE_ARG = /^([gmn]?awk|jq|yq|sed|gsed|perl|python3?|node|ruby|grep|egrep|rg)$/

/** xargs 뒤의 명령: 값을 받는 옵션(-n 1 · -I {} · -J % · -P 4 …)의 값은 건너뛴다 */
function xargsCommand(args: string[]): string[] {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) i += /^-[nIPLsdEaJRS]$/.test(args[i]!) ? 2 : 1
  return args.slice(i)
}

/** 값을 따로 받는 git의 전역 옵션 */
export const GIT_VALUE = /^(-C|-c|--git-dir|--work-tree|--namespace|--super-prefix|--attr-source|--config-env)$/
/** git의 전역 옵션(-C <폴더> · -c k=v · --git-dir <폴더> 와 붙여 쓴 꼴 · 다른 -옵션)을 뗀, 하위 명령부터의 인자 */
function gitArgs(args: string[]): string[] {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) i += GIT_VALUE.test(args[i]!) ? 2 : 1
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
      if (sub === 'reset' && !args.some(longOpt('--hard'))) return 'edit'
      if (sub === 'stash' && /^(list|show)$/.test(args[args.indexOf('stash') + 1] ?? '')) return 'read'
      return 'delete'
    }
    if (sub === 'switch' && args.some((a) => /^(-f|--force|--discard-changes)$/.test(a))) return 'delete'
    if (gitOutside(sub, args.slice(args.indexOf(sub) + 1))) return 'outside'
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
    if (sub === 'remote' && /^(remove|rm|rename|set-head|set-branches|prune|update)$/.test(named[0] ?? '')) return 'edit'
    // 다른 프로그램을 돌리는 옵션: grep -O<명령> · --ext-diff
    if (rest.some((a) => /^--(open-files-in-pager|ext-diff)(=|$)/.test(a)) || (sub === 'grep' && rest.some((a) => /^-[a-zA-Z]*O/.test(a)))) return 'run'
    if (rest.some((a) => /^--output(=|$)/.test(a))) return 'edit'
    if (sub === 'reflog' && /^(expire|delete)$/.test(named[0] ?? '')) return 'delete'
    if (GIT_READ.has(sub)) return 'read'
    return 'run'
  }
  // 읽는 프로그램이라도 파일을 쓰거나 다른 명령을 돌리는 쓰임은 읽기가 아니다 (11/20 보안 검토)
  const positional = args.filter((a) => !a.startsWith('-'))
  const shortHas = (ch: string) => args.some((a) => /^-[a-zA-Z]+/.test(a) && a.slice(1).includes(ch))
  // sed: -i와 w 명령(파일 쓰기)
  // -Ei · -ni처럼 붙여 쓴 꼴과 주소 뒤의 w(1,5w 파일 · $w 파일)도
  // sed: -i와 w 명령(파일 쓰기). 스크립트만 본다(파일 이름 words.txt 의 w 는 아니다): 처음 · ; 뒤의 w, 주소 · s///깃발 뒤의 w
  // 주소 · 깃발에 붙여 쓴 파일 이름(1wout · s/x/y/wout)은 스크립트를 읽어서 본다 (sedWrites, 11/26). 앞의 정규식 판정에 더한다
  if (prog === 'sed') return args.some((a) => /^-[a-zA-Z]*i/.test(a) || /^--in-place/.test(a)) || (sedScripts(args).some((x) => /(^|[;{}\n])\s*w\s*[^\s;]|[^A-Za-z\s][gpIiM\d]*\s*w\s+\S/.test(x)) || sedScripts(args, true).some(sedWrites)) ? 'edit' : 'read'
  // awk의 system() · 명령으로 잇기(| · getline) · 파일 쓰기는 실행으로. print … | 명령 은 문자열 밖의 | 만 (printf "%s|%s" 는 아니다)
  if (prog === 'awk') return args.some((a) => /system\s*\(|getline|\|\s*"|"\s*\||print[^;}|]*>/.test(a) || /print[^;}\n]*\|/.test(a.replace(/"(?:\\.|[^"\\])*"/g, '""'))) ? 'run' : 'read'
  if (prog === 'find') {
    if (args.includes('-delete')) return 'delete'
    if (args.some((a) => /^-(exec|execdir|ok|okdir)$/.test(a))) return 'run'
    return args.some((a) => /^-(fprint|fprint0|fprintf|fls)$/.test(a)) ? 'edit' : 'read'
  }
  if ((prog === 'fd' || prog === 'fdfind') && args.some((a) => FD_EXEC.test(a))) return 'run'
  // rg --pre는 파일마다 그 명령을 돌린다
  if (prog === 'rg' && args.some((a) => /^--(pre|hostname-bin)(=|$)/.test(a))) return 'run'
  if (prog === 'sort' && args.some((a) => /^--compress-program/.test(a))) return 'run'
  if (prog === 'sort' && (shortHas('o') || args.some((a) => /^--output(=|$)/.test(a)))) return 'edit'
  if (prog === 'tree' && args.some((a) => /^-[a-zA-Z]*[oR]/.test(a))) return 'edit'
  // uniq [입력 [출력]]: 둘째 이름은 쓸 파일이다. 입력을 뜻하는 - 와 -- 뒤의 낱말도 이름으로 센다 (uniq - out · uniq -- -a out, 11/26 검토)
  if (prog === 'uniq' && uniqNames(args) > 1) return 'edit'
  // 둘째 이름은 쓸 파일이다
  if (prog === 'xxd' && (shortHas('r') || args.filter((a, n) => !a.startsWith('-') && !/^-[lscgon]$/.test(args[n - 1] ?? '')).length > 1)) return 'edit'
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

/**
 * sed의 스크립트일 수 있는 낱말들: -e 값(-ne'…' 처럼 붙여 쓴 것도) · --expression=값, 없으면 첫 낱말.
 * 첫 낱말이 빈 것일 수 있으면($u · 치환) 그다음도, 빈칸이 든 낱말(파일 이름일 리가 적다)도 스크립트로 읽어 본다
 */
function sedScripts(args: string[], strict = false): string[] {
  const out: string[] = []
  for (let n = 0; n < args.length; n++) {
    const m = /^(?:-[a-zA-Z]*?e|--expression=?)(.*)$/s.exec(args[n]!)
    if (m) out.push(m[1] || (args[++n] ?? ''))
  }
  const named = args.filter((a) => !a.startsWith('-'))
  const first = named.findIndex((a) => !/^(\$\{?\w+\}?|SUBST|\$\(\)|``)+$/.test(a))
  // strict: 스크립트 자리의 낱말만 (빈칸이 든 파일 이름 "new file.txt" 를 스크립트로 읽지 않는다)
  return [...out, ...(out.length ? [] : named.slice(0, first + 1)), ...(strict ? [] : named.filter((a) => /\s/.test(a)))]
}


function touchesOutside(p: string, o: Where): boolean {
  // 중괄호로 여럿이 되는 경로는 하나라도 밖이면 밖이다 ({a,~/x}). 다 펼치지 못할 만큼 많으면 어디인지 모르니 밖으로
  const alts = expandBraces([p])
  return alts.some((x) => hasBraces(x) && !/[\s"]/.test(x)) || alts.some((x) => outsideOne(x, o))
}
function outsideOne(p: string, o: Where): boolean {
  if (p === '/dev/null' || p.startsWith('/dev/std')) return false
  const home = o.home ?? ''
  const cwd = o.cwd.replace(/\/$/, '')
  const bare = p.replace(/^"/, '').replace(/^\$\{?HOME\}?/, '~').replace(/^\$(?:PWD(?!\w)|\{PWD\})/, cwd)
  // ~다른사람 은 그 사람의 홈이다. ${PWD%/*} 처럼 고쳐 펼치는 것은 어디인지 모른다
  if (/^~[^/]/.test(bare) || /^\$\{?(HOME|PWD)/.test(bare)) return true
  const expanded = bare.startsWith('~') ? `${home}${bare.slice(1)}` : bare
  const raw = expanded.startsWith('/') ? expanded : `${cwd}/${expanded}`, abs = normalize(raw)
  // 임시 폴더는 .. 를 푼 뒤에 본다(/tmp/../etc/passwd 는 아니다). 프로젝트가 /tmp 안이면 그 안은 inside 로 본다(git 내부 판정). inside 에는 .. 를 풀기 전의 글(raw)도 준다
  return !((abs === '/tmp' || abs.startsWith('/tmp/')) && abs !== cwd && !abs.startsWith(`${cwd}/`)) && !o.inside(abs, raw)
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
export function runPrograms(cmd: string, depth = 0): string[] {
  const out: string[] = []
  if (depth > DEPTH_MAX) return out
  const sub = substitutions(cmd, { proc: true })
  for (const part of sub.inner) for (const p of runPrograms(part, depth + 1)) if (!out.includes(p)) out.push(p)
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
