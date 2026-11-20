/**
 * 중앙 대화의 우회 (11/20 사용자 결정 "권한 우회는 사용자 허락으로"): 상태 보기 목록(chat-readonly.ts)이 막은 명령도
 * 사용자가 그 명령을 보고 허락하면 돌릴 수 있다. 다만 아래는 허락해도 돌리지 않는다(우회 불가):
 * 강제 푸시 · reset --hard · main 지우기, 임시 폴더 밖 rm -rf, 연구 저장소 workbench/(노트 · 기록) 쓰기.
 * 셸 감싸기(sh -c · eval · xargs · env · sudo …)와 $( … ) 안쪽도 같은 규칙으로 본다
 */
import { segments, substitutions, words } from './chat-auto.js'

export type NeverBypass = 'force-push' | 'reset-hard' | 'delete-main' | 'rm-outside-temp' | 'workbench-write'

const MAIN = /^(refs\/heads\/)?(main|master)$/
const positional = (a: string[]) => a.filter((x) => !x.startsWith('-'))
/** 짧은 옵션 묶음(-rf · -fr)에 글자가 있는지 */
const short = (a: string[], ch: string) => a.some((x) => /^-[a-zA-Z]+$/.test(x) && x.includes(ch))
const wb = (x: string) => /(^|\/)workbench(\/|$)/.test(x)

/** 임시 폴더 안 (그 폴더 자체는 아님). 상대 경로 · .. · 변수는 어디인지 모르니 밖으로 본다 */
export function inTemp(p: string): boolean {
  if (p.includes('..')) return false
  return /^(\/private)?\/tmp\/[^/]+|^(\/private)?\/var\/folders\/[^/]+\/[^/]+\/T\/[^/]+|^\$\{?TMPDIR\}?\/?[^/]+/.test(p)
}

function git(a: string[]): NeverBypass | undefined {
  let i = 0
  while (i < a.length && a[i]!.startsWith('-')) i += a[i] === '-C' || a[i] === '-c' ? 2 : 1
  const sub = a[i] ?? ''
  const rest = a.slice(i + 1)
  const pos = positional(rest)
  if (sub === 'push') {
    if (rest.some((x) => /^(--force|--force-with-lease|--force-if-includes|--mirror)(=|$)/.test(x)) || short(rest, 'f') || pos.some((x) => x.startsWith('+'))) return 'force-push'
    if (pos.some((x) => x.startsWith(':') && MAIN.test(x.slice(1))) || ((rest.includes('--delete') || short(rest, 'd')) && pos.some((x) => MAIN.test(x)))) return 'delete-main'
  }
  if (sub === 'reset' && rest.includes('--hard')) return 'reset-hard'
  if (sub === 'branch' && (short(rest, 'D') || ((rest.includes('--delete') || short(rest, 'd')) && (rest.includes('--force') || short(rest, 'f')))) && pos.some((x) => MAIN.test(x))) return 'delete-main'
  if (/^(checkout|restore|rm|mv|clean|stash|apply)$/.test(sub) && rest.some(wb)) return 'workbench-write'
  return undefined
}

/** 인자를 고쳐 쓰는 프로그램: 어느 인자가 쓰는 곳인지 */
const WRITERS: Record<string, (a: string[]) => string[]> = {
  ...Object.fromEntries(['rm', 'mv', 'touch', 'tee', 'truncate', 'chmod', 'chown', 'rmdir', 'mkdir', 'unlink', 'patch', 'shred'].map((p) => [p, (a: string[]) => a])),
  ...Object.fromEntries(['cp', 'ln', 'install', 'rsync', 'ditto', 'scp'].map((p) => [p, (a: string[]) => positional(a).slice(-1)])),
  dd: (a) => a.filter((x) => x.startsWith('of=')),
}
const INLINE = /^(python3?|node|perl|ruby|osascript)$/
const WRITE_CODE = /['"][wa]\+?b?['"]|write|unlink|remove|rename|rmtree|truncate/i

function segment(w: string[], depth: number): NeverBypass | undefined {
  // 앞말: 환경 변수와 다른 명령을 돌리는 감싸기
  while (w.length) {
    const p = w[0]!.split('/').pop()!
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!)) w = w.slice(1)
    else if (/^(env|sudo|nohup|time|command|nice|exec|caffeinate|timeout|gtimeout)$/.test(p)) {
      w = w.slice(1)
      while (w.length && (w[0]!.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]!) || /^\d+[smhd]?$/.test(w[0]!))) w = w.slice(1)
    } else if (p === 'xargs') {
      w = w.slice(1)
      while (w.length && (w[0]!.startsWith('-') || /^\d+$/.test(w[0]!))) w = w.slice(1)
    } else break
  }
  if (!w.length) return undefined
  const prog = w[0]!.split('/').pop()!
  const a = w.slice(1)
  if (/^(sh|bash|zsh|dash|fish)$/.test(prog)) {
    const c = a.findIndex((x) => /^-\w*c\w*$/.test(x))
    return c >= 0 ? neverBypass(a[c + 1] ?? '', depth + 1) : undefined
  }
  if (prog === 'eval') return neverBypass(a.join(' '), depth + 1)
  if (prog === 'git') return git(a)
  if (prog === 'rm' && (short(a, 'r') || short(a, 'R') || a.includes('--recursive')) && (short(a, 'f') || a.includes('--force')) && (!positional(a).length || !positional(a).every(inTemp))) return 'rm-outside-temp'
  const writes = WRITERS[prog]
  if (writes && writes(a).some(wb)) return 'workbench-write'
  if (/^(sed|gsed|perl)$/.test(prog) && a.some((x) => /^(-i|--in-place|-\w*i)/.test(x)) && a.some(wb)) return 'workbench-write'
  if (INLINE.test(prog) && a.some((x) => /\bworkbench\//.test(x) && WRITE_CODE.test(x))) return 'workbench-write'
  return undefined
}

/** 허락해도 돌리지 않는 명령이면 그 까닭, 아니면 undefined */
export function neverBypass(cmd: string, depth = 0): NeverBypass | undefined {
  if (depth > 4) return undefined
  // 겹친 $( $( … ) )도 안쪽부터 본다
  for (const part of substitutions(cmd).inner) {
    const r = neverBypass(part, depth + 1)
    if (r) return r
  }
  // 파일로 돌려보내기: 받는 곳이 workbench/ 안이면
  for (const m of cmd.matchAll(/(?:^|[^<])>>?\|?\s*("[^"]*"|'[^']*'|[^\s;&|<>]+)/g)) if (wb(m[1]!.replace(/^["']|["']$/g, ''))) return 'workbench-write'
  for (const seg of segments(cmd)) {
    const r = segment(words(seg.replace(/\d?>>?\|?\s*("[^"]*"|'[^']*'|[^\s;&|<>]+)/g, ' ').replace(/&>\s*\S+/g, ' ')), depth)
    if (r) return r
  }
  return undefined
}
