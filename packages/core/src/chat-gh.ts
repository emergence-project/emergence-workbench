// gh 로 읽기만 하는 확실한 명령 (11/26 사용자 결정 "과하게 잡는 것을 풀지" 안 B): 「외부」가 아니라 「웹 보기」로 본다.
// 판정을 가볍게 하는 일이라 막을 꼴을 늘어놓지 않고, 맞는 꼴만 적어 둔다 (chat-shell.ts 의 certainHeredoc 과 같은 방식)
import { ghReads } from './chat-readonly.js'
import { BEFORE_OK, PLAIN, SET_OK } from './chat-shell.js'

/** 낱말 뒤: 빈칸 · 이음 · 끝. 붙어 있는 글(12>&1 의 2 · cat2)을 낱말의 끝으로 읽지 않는다 (11/26 검토) */
const END = String.raw`(?=[ \t|;&\n]|$)`
/** 글자 그대로인 조각: 맨 글자(펼쳐지는 ~ * ? [ ] { } $ ` \ ! # < > ( ) 가 없다), '…', "…"(안에 $ ` \ 없음). 빈 따옴표('' · "")는 조각이 아니다: zsh 는 ''=cat 을 cat 의 경로로 펼친다 (11/26 둘째 검토) */
const BARE = String.raw`[A-Za-z0-9_@%+=:,.\/-]`
const PIECE = `(?:${BARE}|'[^'\\n]+'|"[^"$\`\\\\\\n]+")`
/** 낱말: 조각을 이어 붙인 것(--search='is:open'). = 로 시작하지 않는다 (zsh 의 =명령) */
const ARG = String.raw`[ \t]+(?!=)${PIECE}+${END}`
/** gh 의 출력을 받아도 읽기만 하는 프로그램: 받은 글을 돌리거나 파일에 쓰는 쓰임이 없다. sort(--compress-program) · uniq(둘째 이름에 쓴다) · tee · xargs · sh 는 아니다 */
const READER = String.raw`(?:tail|head|grep|wc|cut|cat|jq)${END}`
/** 오류 출력을 합치거나 출력을 버리는 것: 2>&1 · 2>/dev/null · >/dev/null. 그 밖의 돌려보내기(> 파일 · |& · <)는 없다 */
const QUIET_ONE = String.raw`(?:2>[ \t]*&1|2?>[ \t]*\/dev\/null)${END}`
const QUIET = String.raw`(?:${QUIET_ONE}[ \t]*)*`
const GH = new RegExp(String.raw`^gh((?:${ARG})+)[ \t]*`)
/** gh 뒤 같은 줄: | 로 잇는 읽는 프로그램들뿐이고, 그 줄은 끝 · ; · && · || · 줄바꿈으로 끝난다 */
const TAIL = new RegExp(String.raw`^${QUIET}(?:\|[ \t]*${READER}(?:${ARG})*[ \t]*${QUIET})*(?=$|&&|\|\||[;\n])`)
const WORDS = new RegExp(String.raw`[ \t]+(${PIECE}+)`, 'g')
const PIECES = new RegExp(PIECE, 'g')
const plain = (word: string) => [...word.matchAll(PIECES)].map((p) => (p[0][0] === "'" || p[0][0] === '"' ? p[0].slice(1, -1) : p[0])).join('')

/**
 * 줄에서 처음 나오는 확실한 gh 읽기 명령을 true 로 바꾼 글. 없으면 null.
 * 확실하다는 것:
 * - gh 앞의 글은 PLAIN 이고(따옴표 · 치환 · = · 괄호 · 묶음이 없다) 돌려보내기(버리는 것만 뺀다)와 뒤로 돌린 명령(&)이 없으며, 앞의 명령은 모두
 *   BEFORE_OK(또는 set -e 류)로 시작한다: 별칭 · 함수 · 환경 변수 · 히어독으로 gh 를 다른 것으로 바꾸거나 이 글을 자료로 만들지 못한다.
 *   gh 는 | 뒤가 아니다: 앞 줄이 | 로 끝나도 입력을 받는다 (cat f |⏎gh api … -F q=@-)
 * - gh 의 인자는 글자 그대로인 낱말뿐이고, 중앙이 읽기로 보는 gh 명령이다(ghReads: 보기 · 목록 · GET. 하위 명령은 무리 바로 뒤이고, github.com 이 아닌 곳을
 *   가리키지 않는다). 열쇠를 다루는 auth 와 --hostname 은 아니다
 * - 같은 줄(다음 ; · && · || · 줄바꿈까지)에서 gh 의 출력은 화면이나 읽기만 하는 프로그램으로만 간다. `gh pr view 1 | sh` 는 받아 온 글을 돌린다
 * 바꾼 뒤의 글은 전처럼 판정한다: 이어진 다른 명령 · 읽는 프로그램의 인자(폴더 밖 파일)는 그대로 걸린다
 */
export function ghReadRemoved(cmd: string): string | null {
  for (const m of cmd.matchAll(/(?:^|&&|\|\||[;\n])[ \t]*(?=gh[ \t])/g)) {
    const at = m.index + m[0].length
    const before = cmd.slice(0, at)
    // 버리는 돌려보내기는 무엇도 바꾸지 못한다: 빼고 본다 (앞의 gh 를 true 로 바꾼 자리에 2>&1 이 남는다)
    const b = before.replace(new RegExp(QUIET_ONE, 'g'), ' ')
    if (!PLAIN.test(b) || /[<>]/.test(b) || /(^|[^&])&(?!&)/.test(b) || /\|\s*$/.test(b)) return null
    if (!b.split(/&&|\|\||[;|\n]/).every((c) => { const x = c.trim(); return !x || BEFORE_OK.test(x.split(/[ \t]/)[0]!) || SET_OK.test(x) })) return null
    const g = GH.exec(cmd.slice(at))
    if (!g) return null
    const rest = cmd.slice(at + g[0].length)
    if (!TAIL.test(rest)) return null
    const args = [...g[1]!.matchAll(WORDS)].map((w) => plain(w[1]!))
    // ghReads 가 쓰는 명령과 다른 곳을 가리키는 것(주소 · 호스트가 붙은 저장소 이름)을 거른다. 열쇠를 다루는 auth 와 --hostname 은 여기서 뺀다
    if (args[0] === 'auth' || args.some((a) => /^--hostname(=|$)/.test(a)) || !ghReads(args)) return null
    return `${before}true ${rest}`
  }
  return null
}
