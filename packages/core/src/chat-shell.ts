/**
 * 셸 글 읽기: 명령 줄을 낱말 · 조각으로 나누고, 따옴표 · 돌려보내기 · 치환($( … ))을 읽는다.
 * 무엇을 하는 명령인지(chat-auto.ts) · 상태만 보는지(chat-readonly.ts) · 허락해도 막을지(chat-bypass.ts)의 판정이 함께 쓴다.
 * 셸을 그대로 흉내 내지는 않는다: 판정이 속지 않을 만큼만 읽고, 읽지 못하면 받는 쪽이 무겁게 본다
 */

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
    // >| (덮어쓰기)의 | 는 잇는 것이 아니다
    if (ch === ';' || ch === '\n' || (ch === '|' && !cur.endsWith('>')) || (ch === '&' && !redirect)) {
      out.push(cur); cur = ''
      if ((ch === '|' || ch === '&') && cmd[i + 1] === ch) i++
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** 따옴표 안과 \\ 뒤 글자를 지운 같은 길이의 글 (문법 기호를 찾을 때). \\" 는 따옴표를 열지 않는다 */
export function bare(cmd: string): string {
  let out = ''
  let q: string | null = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (q) {
      if (q === '"' && ch === '\\' && i + 1 < cmd.length) { out += '__'; i++ }
      else if (ch === q) { q = null; out += ch }
      else out += '_'
      continue
    }
    if (ch === '\\' && i + 1 < cmd.length) { out += '__'; i++; continue }
    if (ch === '"' || ch === "'") q = ch
    out += ch
  }
  return out
}

const ANSI_ESCAPE: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
/**
 * $'…' 의 안쪽 글을 셸처럼 푼다 (from = 여는 따옴표 다음 자리). end = 닫는 따옴표 자리.
 * 닫는 따옴표부터 찾는다: 셸은 \\ 다음 한 글자만 넘기므로 \\c · \\x 같은 것이 따옴표를 삼키지 못한다 (`$'\\c' ; rm x ; echo 'a'`)
 */
function ansiString(cmd: string, from: number): { text: string; end: number } {
  let end = from
  while (end < cmd.length && cmd[end] !== "'") end += cmd[end] === '\\' ? 2 : 1
  end = Math.min(end, cmd.length)
  const body = cmd.slice(from, end)
  let text = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\' || i + 1 >= body.length) { text += body[i]; continue }
    const rest = body.slice(i + 1)
    const hex = /^x([0-9a-fA-F]{1,2})/.exec(rest) ?? /^u([0-9a-fA-F]{1,4})/.exec(rest) ?? /^U([0-9a-fA-F]{1,8})/.exec(rest)
    const oct = /^[0-7]{1,3}/.exec(rest)
    if (hex) { const n = parseInt(hex[1]!, 16); text += n <= 0x10ffff ? String.fromCodePoint(n) : '?'; i += hex[0].length }
    else if (oct) { text += String.fromCharCode(parseInt(oct[0], 8) & 0xff); i += oct[0].length }
    else if (rest[0] === 'c' && rest.length > 1) { text += String.fromCharCode(rest.charCodeAt(1) & 0x1f); i += 2 }
    else { text += ANSI_ESCAPE[rest[0]!] ?? `\\${rest[0]}`; i++ }
  }
  return { text, end }
}

/**
 * 줄 잇기(\\ + 줄바꿈)를 셸처럼 지운다: 그대로 두면 `-del\\⏎ete`가 한 낱말 -delete 로 읽히지 않는다 (11/21 보안 검토).
 * 작은따옴표 안에서는 글자 그대로다
 */
export function joinLines(cmd: string): string {
  if (!cmd.includes('\\\n')) return cmd
  let out = ''
  let q: string | null = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (q === "'") { if (ch === q) q = null; out += ch; continue }
    if (ch === '\\' && i + 1 < cmd.length) { if (cmd[i + 1] !== '\n') out += ch + cmd[i + 1]; i++; continue }
    if (q) { if (ch === q) q = null } else if (ch === '"' || ch === "'") q = ch
    out += ch
  }
  return out
}

/**
 * 히어독으로 읽은 글: 본문의 따옴표를 빈칸으로 바꾼 것 (히어독이 없으면 null). 본문에서 따옴표는 글자라, 그대로 읽으면
 * `cat <<E⏎it's⏎E⏎rm -rf x`의 ' 가 뒤 명령을 따옴표 안으로 가져간다. 구분자에 따옴표가 없으면(<<E) 본문의 $( … ) · ` … ` 는
 * 펼쳐지므로 두고, 따옴표로 쌌으면(<<'E') 본문은 글자 그대로라 $ · ` · \\ 도 지운다.
 * 원래 글을 대신하지 않는다 (11/25 셋째 검토): << 가 정말 히어독인지는 여기서 다 알 수 없어서(따옴표 · 주석 안의 <<),
 * 받는 쪽은 원래 글과 이 글을 둘 다 판정해 무거운 쪽을 쓴다. 한쪽으로만 읽으면 본문으로 잘못 본 줄의 명령이 가려진다
 */
export function heredocVariant(cmd0: string): string | null {
  const cmd = joinLines(cmd0)
  const out = heredocQuotes(cmd)
  return out === cmd ? null : out
}
function heredocQuotes(cmd: string): string {
  if (!cmd.includes('<<')) return cmd
  let out = ''
  let pos = 0
  for (let n = 0; n < 50; n++) {
    const rest = cmd.slice(pos)
    const m = /(?<!<)<<(?!<)(-?)[ \t]*([^\s;&|<>()]+)/.exec(bare(rest))
    if (!m) break
    const opEnd = m.index + m[0].length
    const raw = rest.slice(opEnd - m[2]!.length, opEnd)
    const delim = words(raw)[0] ?? raw
    const nl = rest.indexOf('\n', opEnd)
    if (nl < 0) break
    const lines = rest.slice(nl + 1).split('\n')
    const end = lines.findIndex((l) => (m[1] ? l.replace(/^\t+/, '') : l) === delim)
    if (end < 0) break
    const strip = /['"\\]/.test(raw) ? /['"`\\$]/g : /['"]/g
    out += rest.slice(0, nl + 1) + [...lines.slice(0, end).map((l) => l.replace(strip, ' ')), lines[end]].join('\n')
    pos += nl + 1 + lines.slice(0, end + 1).join('\n').length
  }
  return out + cmd.slice(pos)
}

/**
 * 판정하기 전에 글을 셸이 읽는 대로 고쳐 쓴다 (11/25 검토). 다른 판정은 「'」가 따옴표를 열고 다음 「'」에서 닫힌다고만 읽으므로,
 * 셸이 다르게 읽는 자리에서는 따옴표의 짝이 어긋나 그 사이의 명령이 따옴표 안으로 숨는다:
 * - 줄 잇기(\\ + 줄바꿈)를 지운다.
 * - $'…' (안의 \\' · \\x72 를 푸는 따옴표) · $"…" 를 보통 따옴표 글로 바꾼다. `echo $'a\\'' ; rm -rf x ; echo '` · `$'\\x72m' -rf x`
 * - 주석(낱말 처음의 # 부터 줄 끝) 안의 따옴표를 지운다. 주석 안의 따옴표는 따옴표가 아니다: `ls # '⏎rm -rf x # '`
 * 문맥을 따라간다: 큰따옴표 안의 $' 와 # 는 글자고, 그 안의 $( … ) 안에서는 다시 따옴표 · 주석이다
 */
export function prepare(cmd0: string): string {
  const cmd = joinLines(cmd0)
  if (!/\$['"]|#/.test(cmd)) return cmd
  let out = ''
  // 문맥 더미: p = 따옴표 밖(맨 바깥 · $( ) 안, 값은 열린 괄호 수), d = 큰따옴표 안, b = 백틱 안
  const stack: { k: 'p' | 'd' | 'b'; n: number }[] = [{ k: 'p', n: 0 }]
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!, top = stack.at(-1)!
    if (ch === '\\' && i + 1 < cmd.length) { out += ch + cmd[++i]; continue }
    if (ch === '$' && cmd[i + 1] === '(') { stack.push({ k: 'p', n: 0 }); out += '$('; i++; continue }
    if (ch === '`') { if (top.k === 'b') stack.pop(); else stack.push({ k: 'b', n: 0 }); out += ch; continue }
    if (top.k === 'd') { if (ch === '"') stack.pop(); out += ch; continue }
    // 주석: 지우지 않고 안의 따옴표 · \\ · 백틱만 빈칸으로 바꾼다. 주석이 아닐 수도 있어서다(zsh 무늬의 (#q…) 등): 글은 그대로 판정에 보이고, 따옴표의 짝만 어긋나지 않는다
    if (ch === '#' && (i === 0 || /[\s;|&()`]/.test(cmd[i - 1]!))) {
      const end = cmd.indexOf('\n', i)
      const to = end < 0 ? cmd.length : end
      out += cmd.slice(i, to).replace(/['"`\\]/g, ' ')
      i = to - 1
      continue
    }
    if (ch === '$' && cmd[i + 1] === "'") {
      const s = ansiString(cmd, i + 2)
      out += `'${s.text.replace(/'/g, "'\\''")}'`
      i = s.end
      continue
    }
    // $"…" 는 "…" 와 같다 (번역 표시)
    if (ch === '$' && cmd[i + 1] === '"') continue
    if (ch === "'") {
      const end = cmd.indexOf("'", i + 1)
      out += cmd.slice(i, end < 0 ? undefined : end + 1)
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

/**
 * 조각 하나의 돌려보내기. out = 쓰는 곳(> · >> · &> · >| · >! 의 파일), in = 읽어 들이는 곳(< 파일), rest = 돌려보내기를 뺀 글.
 * 따옴표 안의 < > 는 글자다(grep "=>" · awk '$1 < 3'). 받는 곳은 따옴표를 벗겨 준다: 벗기지 않으면 > '/etc/x' 가 폴더 안 상대 경로로 읽혔다.
 * 2>&1 · >&2 (번호로 합치기) · << (히어독) · <<< 는 파일이 아니다
 */
export function redirects(seg: string): { out: string[]; in: string[]; rest: string } {
  const out: string[] = []
  const inn: string[] = []
  let rest = ''
  let at = 0
  for (const m of bare(seg).matchAll(/(?:(?<![^\s])\d+|&)?(>>?[|!]?|<<<|<<-?|<)(&?)[ \t]*([^\s;&|<>()]*)/g)) {
    const end = m.index + m[0].length
    const word = words(seg.slice(end - m[3]!.length, end))[0] ?? ''
    if (m[1]![0] === '>') { if (word && !(m[2] && /^(\d+|-)$/.test(word))) out.push(word) }
    else if (m[1] === '<' && !m[2] && word) inn.push(word)
    rest += `${seg.slice(at, m.index)} `
    at = end
  }
  return { out, in: inn, rest: rest + seg.slice(at) }
}

/**
 * zsh의 무늬 꼬리표: 낱말에 붙은 ( … ) 안의 글 (따옴표 밖의 것). `ls *(e:'rm -rf x':)`는 찾은 파일마다 그 명령을 돌리고,
 * `*(+이름)`은 그 이름의 명령을 돌린다. 배열(a=(1 2)) · 함수 정의(f())의 괄호도 여기로 오지만 돌리는 글이 없어 걸리지 않는다
 */
export function qualifiers(seg: string): string[] {
  const b = bare(seg)
  const out: string[] = []
  for (let i = 1; i < b.length; i++) {
    if (b[i] !== '(' || /[\s;&|(]/.test(b[i - 1]!)) continue
    let depth = 1
    let j = i + 1
    for (; j < b.length && depth > 0; j++) { if (b[j] === '(') depth++; else if (b[j] === ')') depth-- }
    out.push(seg.slice(i + 1, depth === 0 ? j - 1 : j))
    i = j - 1
  }
  return out
}
/** 꼬리표 글에서 돌리는 것: e<구분자>명령<구분자> 의 명령들, +이름이 있으면 run */
export function qualifierRuns(text: string): { code: string[]; calls: boolean } {
  const plain = unmask(words(text).join(' '))
  const code: string[] = []
  for (const m of plain.matchAll(/e([^\w\s[\]{}<>()])([\s\S]*?)\1|e\[([^\]]*)\]|e\{([^}]*)\}|e<([^>]*)>/g)) code.push(m[2] ?? m[3] ?? m[4] ?? m[5] ?? '')
  return { code, calls: /\+[A-Za-z_]/.test(plain) }
}

/**
 * 작은따옴표 안의 $ ` ( ) 를 가린다: 셸은 그 안을 글자 그대로 읽으므로 치환이 아니다. 가리지 않으면 아래 정규식이
 * `echo '$(echo ' ; rm -rf x ; echo ')'`의 두 따옴표 글을 치환 하나로 짝지어, 그 사이의 명령을 통째로 가린다.
 * 문맥을 따라간다: 큰따옴표 안에서는 ' 가 글자지만, 그 안의 $( … ) 안에서는 다시 따옴표다
 */
const MASKED: Record<string, string> = { $: '\uE000', '`': '\uE001', '(': '\uE002', ')': '\uE003' }
const UNMASKED: Record<string, string> = Object.fromEntries(Object.entries(MASKED).map(([k, v]) => [v, k]))
/**
 * 가린 글자를 되돌린다. 가림은 치환을 찾는 정규식만을 위한 것이다: 낱말로 나눈 뒤의 판정(프로그램 이름 · 옵션 · sh -c 안의 명령 ·
 * awk · python 코드)은 되돌린 진짜 글로 해야 한다. 되돌리지 않으면 `awk '{system("rm x")}'`가 읽기로, `python3 -c 'exec(…)'`가
 * 상태 보기로 통했다 (11/25: #681이 _ 로 가리면서 생긴 구멍)
 */
export const unmask = (s: string): string => s.replace(/[\uE000-\uE003]/g, (ch) => UNMASKED[ch]!)

function maskLiteral(cmd0: string): string {
  // 가림에 쓰는 글자가 처음부터 들어 있으면 되돌릴 때 $ ( ) 로 바뀐다: 다른 글자로 바꿔 둔다
  const cmd = cmd0.replace(/[\uE000-\uE003]/g, '?')
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
      out += `'${cmd.slice(i + 1, end < 0 ? undefined : end).replace(/[$\`()]/g, (ch) => MASKED[ch]!)}${end < 0 ? '' : "'"}`
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

/** 따옴표와 치환이 서로 겹친 깊이의 한도: 넘으면 짝을 찾지 못한 것으로 본다 (받는 쪽이 무겁게 본다). 수천 겹이면 되부르기가 넘친다 */
const NEST_MAX = 100

/** i = 여는 ( 의 자리. 짝이 맞는 ) 의 자리 (없으면 -1). 따옴표 · \\ · 안쪽 괄호를 지킨다: 따옴표 친 ) 는 닫는 괄호가 아니다 */
function closeParen(cmd: string, i: number, nest = 0): number {
  if (nest > NEST_MAX) return -1
  let depth = 0
  for (let j = i; j < cmd.length; j++) {
    const ch = cmd[j]!
    if (ch === '\\') { j++; continue }
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = ch === "'" ? cmd.indexOf("'", j + 1) : ch === '"' ? closeDouble(cmd, j, nest + 1) : closeTick(cmd, j)
      if (end < 0) return -1
      j = end
    }
    else if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return j
  }
  return -1
}
/** i = 여는 " 의 자리. 닫는 " 의 자리 (없으면 -1). 안의 $( … ) · ` … ` 속 따옴표는 이 따옴표를 닫지 않는다 */
function closeDouble(cmd: string, i: number, nest = 0): number {
  if (nest > NEST_MAX) return -1
  for (let j = i + 1; j < cmd.length; j++) {
    const ch = cmd[j]!
    if (ch === '\\') { j++; continue }
    if (ch === '"') return j
    if (ch !== '`' && !(ch === '$' && cmd[j + 1] === '(')) continue
    const end = ch === '`' ? closeTick(cmd, j) : closeParen(cmd, j + 1, nest + 1)
    if (end < 0) return -1
    j = end
  }
  return -1
}
function closeTick(cmd: string, i: number): number {
  for (let j = i + 1; j < cmd.length; j++) { if (cmd[j] === '\\') j++; else if (cmd[j] === '`') return j }
  return -1
}

/**
 * $( … ) · ` … ` 를 한 겹 꺼내 자리표(SUBST)로 바꾼다 (맨 바깥과 큰따옴표 안의 것. 작은따옴표 안은 글자다).
 * inner = 꺼낸 글(안에 겹친 것은 받는 쪽이 그 글로 다시 부를 때 꺼낸다), left = 짝이 맞지 않아 다 꺼내지 못했는지.
 * 글을 걸으며 짝을 찾는다 (11/25 검토): 정규식으로 찾으면 `$(echo ")" ; rm -rf x)`의 따옴표 친 ) 에서 치환이 끝난 줄 알았다.
 * flat은 작은따옴표 안의 $ ` ( ) 를 가린 글이다 (unmask로 되돌린다)
 */
export function substitutions(raw: string, o: { proc?: boolean } = {}): { inner: string[]; flat: string; left: boolean } {
  const cmd = prepare(raw)
  const inner: string[] = []
  let out = ''
  let left = false
  let dq = false
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (ch === '\\' && i + 1 < cmd.length) { out += ch + cmd[++i]; continue }
    if (!dq && ch === "'") {
      const end = cmd.indexOf("'", i + 1)
      out += cmd.slice(i, end < 0 ? undefined : end + 1)
      i = end < 0 ? cmd.length : end
      continue
    }
    if (ch === '"') { dq = !dq; out += ch; continue }
    // proc: <( … ) · >( … ) 와 zsh의 =( … ) (낱말 처음의 것)도 안의 명령을 돌린다 (cat <(rm x) · cat =(rm x) 가 읽기로 보이지 않게)
    const paren = cmd[i + 1] === '(' && (ch === '$' || (!!o.proc && !dq && (ch === '<' || ch === '>' || (ch === '=' && (i === 0 || /[\s;|&(]/.test(cmd[i - 1]!))))))
    if (!paren && ch !== '`') { out += ch; continue }
    const end = paren ? closeParen(cmd, i + 1) : closeTick(cmd, i)
    if (end < 0) { left = true; out += cmd.slice(i); break }
    inner.push(cmd.slice(i + (paren ? 2 : 1), end))
    out += 'SUBST'
    i = end
  }
  return { inner, flat: maskLiteral(out), left }
}

/** 긴 옵션의 줄임꼴도 같은 옵션으로 본다 (git · getopt_long은 --outp=x 를 --output=x 로, --har 를 --hard 로 읽는다) */
export const longOpt = (...names: string[]) => (x: string) => {
  const k = x.split('=')[0]!
  return k.length >= 3 && k.startsWith('--') && names.some((n) => n.startsWith(k))
}

/** 중괄호 안의 글이 펼쳐지는 꼴이면 그 낱말들: a,b,c · 1..3 · a..c. 아니면 null ({} · ${x} 의 x 등) */
function braceAlts(body: string): string[] | null {
  if (body.includes(',')) return body.split(',')
  const num = /^(-?\d+)\.\.(-?\d+)$/.exec(body)
  const chr = /^([A-Za-z])\.\.([A-Za-z])$/.exec(body)
  const [from, to] = num ? [Number(num[1]), Number(num[2])] : chr ? [chr[1]!.charCodeAt(0), chr[2]!.charCodeAt(0)] : [0, -1]
  if ((!num && !chr) || Math.abs(to - from) > 64) return null
  const out: string[] = []
  for (let n = from; from <= to ? n <= to : n >= to; n += from <= to ? 1 : -1) out.push(num ? String(n) : String.fromCharCode(n))
  return out
}
/** 낱말의 첫 중괄호 묶음을 펼친 낱말들 (없으면 null). 변수 ${x} 의 중괄호는 아니다 */
function braceOnce(x: string): string[] | null {
  if (/[\s"]/.test(x)) return null
  for (const m of x.matchAll(/\{([^{}]*)\}/g)) {
    if (x[m.index - 1] === '$') continue
    const alts = braceAlts(m[1]!)
    if (alts) return alts.map((alt) => `${x.slice(0, m.index)}${alt}${x.slice(m.index + m[0].length)}`)
  }
  return null
}
/** 펼칠 중괄호가 (아직) 남아 있는 낱말인지 */
export const hasBraces = (x: string) => braceOnce(x) !== null

/** 빈 것일 수 있는 것: 변수($u · ${u}) · 빈 치환($() · `` · 자리표). 뒤에 / 가 오는 경로 머리($PWD/…)는 아니다 */
const MAYBE_EMPTY = /\$\{[A-Za-z_]\w*\}(?!\/)|\$[A-Za-z_]\w*(?!\/)|\$\(\)|``|SUBST/g
/**
 * 셸이 낱말을 펼쳐 만들 수 있는 꼴을 미리 펼친 낱말들 (11/25 검토: 펼친 뒤에야 옵션 · 경로가 되는 꼴을 읽지 못했다):
 * - 중괄호: -{delete,print} → -delete -print, {/etc/passwd,} → /etc/passwd 와 빈 낱말, -{d..d}elete → -delete
 * - 기본값: ${x:--delete} · ${:--delete} → -delete
 * - 옵션 이름 안의 변수 · 빈 치환은 빈 것으로도 읽는다: -del${u}ete · $u-delete · -del$()ete → -delete (값 쪽 --out=$PWD/x 는 둔다)
 * 그럴 수도 있다는 것이지 늘 그렇지는 않다(${HOME:-x} 는 보통 $HOME 이다): 받는 쪽은 alternatives로 원래 낱말과 둘 다 본다
 */
export function expandWords(w: string[]): string[] {
  const out = w.map((x) => {
    const d = x.replace(/\$\{[A-Za-z_]?\w*:?[-=+]([^{}]*)\}/g, '$1')
    const eq = d.indexOf('=')
    const name = (eq < 0 ? d : d.slice(0, eq)).replace(MAYBE_EMPTY, '')
    return name.startsWith('-') ? name + (eq < 0 ? '' : d.slice(eq)) : d
  })
  return expandBraces(out)
}
/** 중괄호만 펼친 낱말들. 너무 많으면 펼치다 만 채로 돌려준다 (hasBraces로 알 수 있다) */
export function expandBraces(w: string[]): string[] {
  let out = w
  for (let round = 0; round < 12; round++) {
    let grew = false
    const next = out.flatMap((x) => { const alts = braceOnce(x); if (alts) grew = true; return alts ?? [x] })
    if (!grew || next.length > 512) break
    out = next
  }
  return out
}
/** 판정해 볼 낱말 묶음들: 원래 낱말, 그리고 펼친 것이 다르면 그것도. 받는 쪽은 그중 무거운 판정을 쓴다 */
export function alternatives(w: string[]): string[][] {
  const e = expandWords(w)
  return e.length === w.length && e.every((x, i) => x === w[i]) ? [w] : [w, e]
}

/**
 * 낱말들을 묶음의 경계( { · } · () · } 뒤의 always )에서 나눈 것: zsh는 `{ true } always { rm x }` · `() { rm x }`처럼 ; 없이도 묶음을 닫는다.
 * { 는 명령 자리에서만 묶음이고 인자 자리에서는 낱말이다(rm a { b): 받는 쪽은 나누지 않은 낱말과 둘 다 본다
 */
export function splitGroups(w: string[]): string[][] {
  const out: string[][] = [[]]
  let closed = false
  for (const x of w) {
    // 함수 정의 f () { … } 의 이름은 명령이 아니다
    if (x === '()' && out.at(-1)!.length === 1) out.pop()
    // always 는 닫힌 묶음 바로 뒤에서만 경계다 (grep --color always 의 always 는 값이다)
    if (x === '{' || x === '}' || x === '()' || (x === 'always' && closed)) out.push([]); else { if (!out.length) out.push([]); out.at(-1)!.push(x) }
    closed = x === '}'
  }
  return out.filter((g) => g.length)
}

/** zsh의 ${(e)…}: 값을 한 번 더 펼친다 (안의 $( … )가 돈다). 그 값의 글들 (따옴표는 벗겨서) */
export function evalFlags(text: string): string[] {
  return [...text.matchAll(/\$\{\(([^)]*)\)([^}]*)\}/g)].filter((m) => m[1]!.includes('e')).map((m) => unmask(m[2]!).replace(/['"]/g, ' '))
}
