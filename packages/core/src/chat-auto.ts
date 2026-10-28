/**
 * 에이전트 대화의 권한을 명령 대신 하는 일로 (10/28 사용자 결정, 시안 4절 "읽기 · 편집 · 실행 · 외부"):
 * 명령 한 줄이 무엇을 하는지 판정하고(commandKind), 권한 이름마다의 「자동 허용」 기본값(presetAuto)을 둔다.
 * 서버의 허락 판정(agentChats.ts judge)과 화면의 토글(AgentChats.tsx)이 함께 쓴다.
 */

export type ChatKind = 'read' | 'edit' | 'delete' | 'run' | 'web' | 'outside'
export interface ChatAutoValues { read: boolean; run: boolean; web: boolean }

/** 권한 이름(읽기 전용 · 묻고 하기 · 계획 모드 · 편집 자동 허용)의 토글 기본값. 편집은 모드가 정한다 */
export function presetAuto(write: 'read' | 'notes', mode: 'ask' | 'plan' | 'edit'): ChatAutoValues {
  if (write === 'read' || mode !== 'ask') return { read: true, run: false, web: false }
  return { read: false, run: false, web: false }
}

/** 이 대화의 토글 값: 기본값 위에 하나씩 바꾼 것 */
export function autoOf(c: { write: 'read' | 'notes'; mode: 'ask' | 'plan' | 'edit'; auto?: Partial<ChatAutoValues> }): ChatAutoValues {
  return { ...presetAuto(c.write, c.mode), ...c.auto }
}

/** 하나씩 바꿔서 권한 이름의 기본값과 다른지 (화면의 「직접 정함」) */
export function autoCustom(c: { write: 'read' | 'notes'; mode: 'ask' | 'plan' | 'edit'; auto?: Partial<ChatAutoValues> }): boolean {
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
  'pdftotext', 'pdfinfo', 'sed', 'awk',
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

/** 따옴표를 지키며 낱말로 나눈다 (작은 셸 흉내, 해석하지 못하면 거칠게) */
function words(seg: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  let any = false
  for (const ch of seg) {
    if (q) { if (ch === q) q = null; else cur += ch; continue }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue }
    cur += ch
  }
  if (cur || any) out.push(cur)
  return out
}

/** 명령 줄을 이음표(; && || |, 줄바꿈)로 나눈다. 따옴표 안은 나누지 않는다 */
function segments(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && cmd[i + 1] === '&')) {
      out.push(cur); cur = ''
      if ((ch === '|' && cmd[i + 1] === '|') || ch === '&') i++
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * 명령이 하는 일. inside(path)는 그 절대 경로가 프로젝트나 등록한 폴더 안인지 (cwd는 프로젝트 폴더).
 * 폴더 밖 경로를 건드리면 외부, 모르는 프로그램은 실행으로 본다
 */
export function commandKind(cmd: string, o: { cwd: string; inside(abs: string): boolean; home?: string }): ChatKind {
  let worst: ChatKind = 'read'
  const bump = (k: ChatKind) => { if (WEIGHT[k] > WEIGHT[worst]) worst = k }
  // $( … ) · ` … ` 안의 명령도 본다
  const inner = [...cmd.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? '')
  for (const part of inner) bump(commandKind(part, o))
  for (const seg of segments(cmd)) {
    // 쓰기 돌려보내기: > 파일 (2>&1 · >/dev/null은 빼고)
    for (const m of seg.matchAll(/(?:^|[^0-9&<>])>>?\s*([^\s;&|]+)/g)) {
      const target = m[1]!
      if (target === '/dev/null' || target.startsWith('&')) continue
      bump(touchesOutside(target, o) ? 'outside' : 'edit')
    }
    let w = words(seg.replace(/\d?>>?\s*\S+/g, ' ').replace(/<\s*\S+/g, ' '))
    // 앞의 환경 변수 (A=1 cmd)와 시간 재기 같은 앞말
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!)) w = w.slice(1)
    while (w.length && /^(time|nice|nohup|command|builtin|exec)$/.test(w[0]!)) w = w.slice(1)
    if (!w.length) continue
    const prog = w[0]!.split('/').pop()!
    const args = w.slice(1)
    bump(kindOf(prog, args))
    // 폴더 밖 경로 (읽기라도 폴더 밖이면 외부)
    for (const a of args) if (looksLikePath(a) && touchesOutside(a, o)) bump('outside')
    if (prog === 'cd' && args[0] && touchesOutside(args[0], o)) bump('outside')
  }
  return worst
}

function kindOf(prog: string, args: string[]): ChatKind {
  if (prog === 'git') {
    const sub = args.find((a) => !a.startsWith('-')) ?? ''
    if (GIT_OUTSIDE.has(sub)) return 'outside'
    if (GIT_DELETE.has(sub)) {
      // checkout <브랜치>는 바꾸기, checkout -- <파일> · reset --hard · restore는 고친 것을 버린다
      if (sub === 'checkout' && !args.includes('--') && !args.includes('.')) return 'edit'
      if (sub === 'reset' && !args.includes('--hard')) return 'edit'
      if (sub === 'stash' && /^(list|show)$/.test(args[args.indexOf('stash') + 1] ?? '')) return 'read'
      return 'delete'
    }
    if (GIT_EDIT.has(sub)) return 'edit'
    if (GIT_READ.has(sub)) return 'read'
    return 'run'
  }
  if (prog === 'sed') return args.some((a) => /^-i/.test(a) || a === '--in-place') ? 'edit' : 'read'
  // awk의 system() · 파일 쓰기는 실행으로
  if (prog === 'awk') return args.some((a) => /system\(|print[^|]*>\s*"/.test(a)) ? 'run' : 'read'
  if (prog === 'find') {
    if (args.includes('-delete')) return 'delete'
    if (args.some((a) => a === '-exec' || a === '-execdir' || a === '-ok')) return 'run'
    return 'read'
  }
  if (prog === 'xargs') return args.length ? kindOf(args.find((a) => !a.startsWith('-')) ?? 'echo', args.slice(1)) : 'read'
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

const looksLikePath = (a: string) => a.startsWith('/') || a.startsWith('~') || a.startsWith('..')

function touchesOutside(p: string, o: { cwd: string; inside(abs: string): boolean; home?: string }): boolean {
  if (p === '/dev/null' || p.startsWith('/dev/std') || p.startsWith('/tmp/') || p === '/tmp') return false
  const home = o.home ?? ''
  const expanded = p.startsWith('~') ? `${home}${p.slice(1)}` : p
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

/** 실행의 「늘」은 프로그램마다: 명령 줄에서 첫 실행 프로그램 이름 (pnpm test면 pnpm test) */
export function runProgram(cmd: string): string {
  for (const seg of segments(cmd)) {
    let w = words(seg)
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!)) w = w.slice(1)
    if (!w.length) continue
    const prog = w[0]!.split('/').pop()!
    if (READS.has(prog) || prog === 'git') continue
    // 꾸러미 관리자 · 스크립트 도구는 하위 명령까지 (pnpm test · npm run build)
    if (/^(npm|pnpm|yarn|bun|uv|make|cargo|go)$/.test(prog)) return [prog, ...w.slice(1).filter((a) => !a.startsWith('-')).slice(0, prog === 'npm' && w[1] === 'run' ? 2 : 1)].join(' ')
    return prog
  }
  return words(cmd)[0] ?? cmd
}
