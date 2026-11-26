// 한 줄에 글자 그대로 적힌 변수 값(for x in … · x=…)을 적어 두고, 그 값을 넣어 다시 판정할 글을 만든다 (chat-auto.ts에서 나눔)

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
