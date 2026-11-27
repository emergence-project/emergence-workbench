/**
 * 명령 판정(commandKind)이 경로를 어디로 볼지 (11/27 앱 전체 보안 검토): 경로로 볼 낱말, 새 자리와 주고받는 git, 줄 안의 cd 자리.
 */
import { segments, substitutions, unmask, words } from './chat-shell.js'

/** 받기(fetch · pull)에서 값을 따로 받는 옵션: 그 값은 저장소 자리가 아니다 */
const FETCH_VALUE = /^(--depth|--deepen|--shallow-since|--shallow-exclude|-j|--jobs|-o|--server-option|--negotiation-tip|--refmap|--upload-pack|--filter|-s|--strategy|-X|--strategy-option)$/

/**
 * 정해 둔 원격(origin 같은 이름)이 아닌 새 자리와 주고받는 git (11/27 보안 검토): `git fetch "https://…/$(읽은 글)"` 처럼 주소에 글을 실어 보낼 수 있어
 * 밖으로 본다. 받기의 저장소 자리(값을 받는 옵션 뒤의 값은 건너뛴 첫 인자)가 이름 꼴이 아니면 새 자리다. 원격 주소를 정하는 remote add · set-url 도
 * (이름으로 받는 것은 사용자가 정해 둔 곳이라 편집 그대로다)
 */
export function gitNewPlace(sub: string, rest: string[]): boolean {
  if (sub === 'remote') return /^(add|set-url)$/.test(rest.find((a) => !a.startsWith('-')) ?? '')
  if (sub !== 'fetch' && sub !== 'pull') return false
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (a === '--') return i + 1 < rest.length && !REMOTE_NAME.test(rest[i + 1]!)
    if (!a.startsWith('-')) return !REMOTE_NAME.test(a)
    if (FETCH_VALUE.test(a)) i++
  }
  return false
}
const REMOTE_NAME = /^[\w-][\w.-]*$/

/** 옵션에 붙여 적은 경로도 본다: --file=/etc/x · -f/etc/x · of=/etc/x */
export const pathPart = (a: string) => /^--?[A-Za-z][\w-]*=(.+)$/.exec(a)?.[1] ?? /^-[A-Za-z]([/~].+)$/.exec(a)?.[1] ?? /^[A-Za-z_]\w*=([/~.].*)$/.exec(a)?.[1] ?? a
/** 가운데의 ../ 로 폴더를 벗어나는 것도 본다 (sub/../../밖) */
export const looksLikePath = (a: string) => a.startsWith('/') || a.startsWith('~') || a.startsWith('..') || a.includes('../') || a.endsWith('/..') || /^"?\$\{?(HOME|PWD)\b/.test(a)
/** 경로로 볼 낱말: 경로 모양이거나, every(서버가 실제 파일로 판정할 때)면 옵션이 아닌 낱말 모두 (11/27) */
export const pathWord = (v: string, every?: boolean) => looksLikePath(v) || (!!every && !!v && !v.startsWith('-'))

/**
 * 줄 안에서 cd 로 옮겨 가는 자리: `cd notes && cp x h/y` 의 h/y 는 프로젝트 폴더가 아니라 notes 에서 본 경로다.
 * 판정이 낱말을 모두 경로로 볼 때(every) 서버가 넘겨 상대 경로를 이 자리들에서도 본다. 옮겨 간 자리는 앞의 cd 에 이어 붙인다 (cd a; cd b → a/b)
 */
export function cdBases(cmd: string, cwd: string, home: string): string[] {
  const out: string[] = []
  for (const seg of segments(substitutions(cmd, { proc: true }).flat)) {
    const w = words(seg).map(unmask)
    for (let i = 0; i < w.length - 1; i++) {
      if ((w[i] !== 'cd' && w[i] !== 'pushd') || w[i + 1]!.startsWith('-')) continue
      const to = w[i + 1]!.replace(/^~(?=\/|$)/, home)
      out.push(to.startsWith('/') ? to : `${out[out.length - 1] ?? cwd}/${to}`)
      if (out.length >= 16) return out
    }
  }
  return out
}
