/** 글 속 주소(https://…)를 링크로 나눈다 (10/28 08:29 피드백: 답의 시안 주소를 눌러 가게) */
export type TextPart = { kind: 'text' | 'url'; text: string }

const URL_RE = /https?:\/\/[^\s<>"'`「」『』]+/g
// 주소 끝에 붙은 문장 부호는 주소가 아니다 (괄호는 짝이 없을 때만 뺀다)
const TRAIL = /[.,;:!?。、)\]]+$/

export function textLinks(text: string): TextPart[] {
  const out: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]
    const tail = TRAIL.exec(url)?.[0] ?? ''
    if (tail) {
      let cut = tail.length
      // 주소 안에 여는 괄호가 있으면 닫는 괄호 하나는 주소의 것
      if (tail.startsWith(')') && url.slice(0, -tail.length).includes('(')) cut -= 1
      url = url.slice(0, url.length - cut)
    }
    if (!/^https?:\/\/[^/]+\.[^/]/.test(url) && !/^https?:\/\/localhost|^https?:\/\/127\./.test(url)) continue
    if (m.index! > at) out.push({ kind: 'text', text: text.slice(at, m.index) })
    out.push({ kind: 'url', text: url })
    at = m.index! + url.length
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}
