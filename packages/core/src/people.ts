/**
 * 네트워킹의 사람 (10/4 피드백 "사이드 바에 사람들을 두자 … 사람마다 개별 페이지").
 * 저자와 소속(authors)에 있는 사람은 저절로 들어오고, 관심 있는 연구자를 따로 더할 수 있다 (앱 설정 config.yaml의 people:).
 * 사람 페이지의 논문은 우선 노트 참고 문헌(bib)에서 그 사람이 저자인 항목만 모은다. arXiv 새 논문은 나중에.
 */
export interface Person {
  name: string
  /** bib에 다르게 적힌 이름 (예: "A. E. Example") */
  aliases?: string[]
  /** 한 줄 메모 (예: 소속, 관심 주제) */
  note?: string
  /** 연구 분야 이름표 (예: "그래프 이론", "조합론"). 네트워킹 첫 화면에서 분야별로 묶는다 (10/4 14:46 피드백) */
  tags?: string[]
  /** 즐겨찾기: 네트워킹 첫 화면에서 맨 앞에 둔다 (10/4 16:19 피드백) */
  star?: boolean
  /**
   * 소속 (첫째가 주소속, 나머지는 보조 소속), 이메일, 홈페이지 (10/4 18:55 "사람 프로필: 소속·이메일").
   * 저자와 소속(authors)에 있는 사람은 소속·이메일을 그쪽에서 읽으므로 여기에 두지 않는다.
   */
  affiliations?: string[]
  email?: string
  /** 그 밖의 이메일 (10/4 20:53) */
  emails?: string[]
  homepage?: string
}

const MAX_PEOPLE = 100
const MAX_LINE = 200

const oneLine = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '')

export function normalizePeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return []
  const out: Person[] = []
  for (const r of raw.slice(0, MAX_PEOPLE)) {
    if (!r || typeof r !== 'object') continue
    const p = r as Record<string, unknown>
    const name = oneLine(p.name)
    if (!name || out.some((x) => personId(x.name) === personId(name))) continue
    const aliases = Array.isArray(p.aliases) ? p.aliases.map(oneLine).filter(Boolean).slice(0, 10) : []
    const note = oneLine(p.note)
    const tags = Array.isArray(p.tags) ? [...new Set(p.tags.map(oneLine).filter(Boolean))].slice(0, 10) : []
    const affiliations = Array.isArray(p.affiliations) ? p.affiliations.map(oneLine).filter(Boolean).slice(0, 5) : []
    const email = oneLine(p.email)
    const emails = Array.isArray(p.emails) ? [...new Set(p.emails.map(oneLine).filter((e) => e && e !== email))].slice(0, 5) : []
    const homepage = /^https?:\/\//i.test(oneLine(p.homepage)) ? oneLine(p.homepage) : ''
    out.push({
      name, ...(aliases.length && { aliases }), ...(note && { note }), ...(tags.length && { tags }), ...(p.star === true && { star: true }),
      ...(affiliations.length && { affiliations }), ...(email && { email }), ...(email && emails.length && { emails }), ...(homepage && { homepage }),
    })
  }
  return out
}

/** 악센트와 LaTeX 꾸밈({\"o}, \'e …)을 뺀 소문자 */
function plain(s: string): string {
  return s
    .replace(/\\[a-zA-Z]+\s*/g, '').replace(/\\./g, '').replace(/[{}]/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
}

/** 주소에 쓰는 사람 id: "Ada E. Example" → "ada-e-example" */
export function personId(name: string): string {
  return plain(name).replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'person'
}

/** 이름 하나를 성과 이름 첫 글자로: "Example, Ada E." · "Ada E. Example" → { family: "example", initial: "a" } */
export function nameKey(name: string): { family: string; initial: string } {
  const n = plain(name)
  if (n.includes(',')) {
    const [family, given = ''] = n.split(',', 2)
    return { family: family!.trim(), initial: given.trim().charAt(0) }
  }
  const parts = n.split(/\s+/).filter(Boolean)
  const family = parts.pop() ?? ''
  return { family, initial: (parts[0] ?? '').charAt(0) }
}

/** bib의 author 줄을 사람마다 나눈다 ("A and B and others") */
export function splitBibAuthors(author: string | undefined): string[] {
  if (!author) return []
  return author.split(/\s+and\s+/i).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== 'others')
}

/** 이 사람이 bib author 줄의 저자 중 하나인가 (성이 같고, 이름 첫 글자가 있으면 그것도 같다) */
export function isAuthorOf(person: Person, author: string | undefined): boolean {
  const keys = [person.name, ...(person.aliases ?? [])].map(nameKey).filter((k) => k.family)
  return splitBibAuthors(author).some((a) => {
    const b = nameKey(a)
    return keys.some((k) => k.family === b.family && (!k.initial || !b.initial || k.initial === b.initial))
  })
}

const ORG = /universit|institut|college|school|academy|laborator|\blab\b|cent(er|re)|foundation|research|대학|연구소|연구원/i
const UNIT = /^(department|dept\.?|division|faculty|graduate school|school of|group|학과|학부)/i

/**
 * 소속 한 줄에서 기관 이름만: "Department of Mathematics, Example Institute of Science and Technology, Example City 00000, Exland"
 * → "Example Institute of Science and Technology". 기관 같은 조각이 없으면 첫 조각.
 */
export function orgOf(affiliation: string): string {
  const parts = affiliation.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return parts.find((s) => ORG.test(s) && !UNIT.test(s)) ?? parts.find((s) => ORG.test(s)) ?? parts[0] ?? ''
}

export interface PersonSuggestion {
  /** "이름 성" 꼴로 */
  name: string
  /** 이 사람이 저자인 논문 수 (같은 논문은 한 번) */
  count: number
  /** 참고 문헌에 다르게 적힌 이름 (더할 때 "다른 이름"으로 넣는다) */
  aliases?: string[]
}

const ACCENT: Record<string, string> = { "'": '\u0301', '"': '\u0308', '`': '\u0300', '^': '\u0302', '~': '\u0303' }

/** "Example, Ada E." → "Ada E. Example". bib 중괄호는 빼고 \\'e 같은 악센트는 é로 */
export function displayName(bibName: string): string {
  const n = bibName
    .replace(/\\(['"`^~])\{?([A-Za-z])\}?/g, (_m, a: string, c: string) => (c + ACCENT[a]).normalize('NFC'))
    .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
  if (!n.includes(',')) return n
  const [family, given = ''] = n.split(',', 2)
  return `${given.trim()} ${family!.trim()}`.trim()
}

/**
 * 논문 저자 줄들에서 자주 나오는 사람 (10/4 16:56): 이미 있는 사람(known)은 빼고, min편 이상인 사람을 많은 순으로 limit명.
 * 같은 사람인지는 isAuthorOf와 같은 기준(성 + 이름 첫 글자)으로 본다.
 */
export function suggestPeople(authors: (string | undefined)[], known: Person[], min = 2, limit = 6): PersonSuggestion[] {
  const tally = new Map<string, { names: Map<string, number>; count: number }>()
  for (const line of authors) {
    const seen = new Set<string>()
    for (const a of splitBibAuthors(line)) {
      const k = nameKey(a.replace(/[{}]/g, ''))
      if (!k.family || !k.initial) continue
      const id = `${k.family}|${k.initial}`
      if (seen.has(id)) continue
      seen.add(id)
      const t = tally.get(id) ?? { names: new Map(), count: 0 }
      t.count++
      const shown = displayName(a)
      t.names.set(shown, (t.names.get(shown) ?? 0) + 1)
      tally.set(id, t)
    }
  }
  return [...tally.values()]
    .filter((t) => t.count >= min)
    .map((t) => {
      const [name, ...others] = [...t.names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([n]) => n)
      return { name: name!, count: t.count, ...(others.length && { aliases: others.slice(0, 5) }) }
    })
    .filter((s) => !known.some((p) => isAuthorOf(p, s.name)))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}
