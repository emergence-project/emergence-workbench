// sed 스크립트 읽기 (chat-auto.ts의 명령 판정이 쓴다. 그 파일이 길어 나눴다)

/**
 * sed 스크립트가 파일을 쓰는가 (11/26): w · W 명령(주소 뒤에 붙여 쓴 것도: 1wout · /re/wout · $wout)과 s///w 깃발(s/x/y/wout).
 * 명령을 차례로 읽는다: 무늬 · 바꿀 글 안의 w(s/word/x/ · /www/p · y/abc/wxy/)는 건너뛴다. 읽다가 막히면 false (앞의 정규식 판정이 따로 있다)
 */
export function sedWrites(s: string): boolean {
  const n = s.length
  let i = 0
  // [ … ] 를 건너뛴다 (i = 여는 [ 자리 → 닫는 ] 자리). 안의 [:alpha:] · [=a=] · [.a.] 와 맨 앞의 ] 는 닫는 것이 아니다. 닫히지 않으면 그대로 둔다
  // (닫는 ] 가 없는 줄은 한 번만 훑는다: [ 가 수만 개여도 찾을 때마다 줄 끝까지 가지 않게)
  let dead = -1
  const noClass = new Set<string>()
  const bracket = (): void => {
    if (i < dead) return
    let j = i + 1
    if (s[j] === '^') j++
    if (s[j] === ']') j++
    for (; j < n && s[j] !== '\n'; j++) {
      const k = s[j + 1] ?? ''
      if (s[j] === '[' && (k === ':' || k === '=' || k === '.') && !noClass.has(k)) {
        const close = s.indexOf(`${k}]`, j + 2)
        if (close < 0) { noClass.add(k); continue }
        j = close + 1
        continue
      }
      if (s[j] === ']') { i = j; return }
    }
    dead = j
  }
  // 구분자까지 건너뛴다 (\\ 뒤 글자와 [ … ] 안의 구분자는 글자다). 닫히지 않으면 false
  const skipTo = (d: string, brackets: boolean): boolean => {
    while (i < n && s[i] !== d) {
      if (s[i] === '\\') i++
      else if (brackets && s[i] === '[') bracket()
      i++
    }
    if (i >= n) return false
    i++
    return true
  }
  const address = (): boolean => {
    if (/\d/.test(s[i] ?? '')) { while (i < n && /[\d~]/.test(s[i]!)) i++; return true }
    if (s[i] === '$') { i++; return true }
    if (s[i] === '/') { i++; if (!skipTo('/', true)) return false; while (i < n && /[IM]/.test(s[i]!)) i++; return true }
    if (s[i] === '\\' && i + 1 < n) { const d = s[i + 1]!; i += 2; if (!skipTo(d, true)) return false; while (i < n && /[IM]/.test(s[i]!)) i++; return true }
    return true
  }
  const blanks = () => { while (i < n && /[ \t]/.test(s[i]!)) i++ }
  const toLineEnd = () => { while (i < n && s[i] !== '\n') { if (s[i] === '\\') i++; i++ } }
  // w 뒤는 줄 끝까지가 파일 이름이다 (; 로 시작해도: 1w;x 는 ;x 에 쓴다)
  const named = (): boolean => { blanks(); return i < n && s[i] !== '\n' }
  for (let guard = 0; i < n; guard++) {
    // 명령이 너무 많으면 다 읽지 않고 쓰는 것으로 본다
    if (guard > 5000) return true
    while (i < n && /[\s;{}]/.test(s[i]!)) i++
    if (i >= n) break
    if (s[i] === '#') { while (i < n && s[i] !== '\n') i++; continue }
    if (!address()) return false
    blanks()
    if (s[i] === ',') { i++; blanks(); if (s[i] === '+' || s[i] === '~') i++; if (!address()) return false }
    while (i < n && /[ \t!]/.test(s[i]!)) i++
    const c = s[i]
    if (c === undefined) break
    i++
    if (c === 'w' || c === 'W') { if (named()) return true; continue }
    if (c === 's' || c === 'y') {
      const d = s[i]
      if (d === undefined || d === '\n' || d === '\\') return false
      i++
      if (!skipTo(d, c === 's') || !skipTo(d, false)) return false
      if (c === 's') {
        while (i < n && /[gpIiMme\d]/.test(s[i]!)) i++
        if (s[i] === 'w') { i++; if (named()) return true }
      }
      continue
    }
    // 글을 받는 명령(a · i · c)과 파일 · 이름표를 받는 명령(r · R · b · t · T · :)은 줄 끝(또는 ;)까지가 그 값이다
    if (/[aic]/.test(c)) { toLineEnd(); continue }
    if (/[rRbtT:]/.test(c)) { while (i < n && !/[\n;]/.test(s[i]!)) i++; continue }
  }
  return false
}
