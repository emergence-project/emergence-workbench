/**
 * 앱 소개의 절 파일 apps/web/src/about/<쪽>/<절>.md (2026-11-27 사용자 결정 "소개를 에이전트가 읽는 정본으로").
 * 화면 · 서버 · MCP · 검사 스크립트가 같은 파일을 읽도록 형식을 여기 한 곳에서 푼다(React · YAML 라이브러리 없이).
 *
 * ---
 * id: edits                        # 주소 #/about/<쪽>/<id> (없으면 쪽 안 순서)
 * title: { ko: 수정 검토, en: Edit review }
 * summary:                         # 한 줄 요약 (필수): 에이전트가 먼저 받는 글
 *   ko: …
 *   en: …
 * code: [apps/web/src/AgentEditsPage.tsx, apps/server/src/agentEdits*.ts]   # 구현 파일 glob (필수)
 * mcp: [edit_note]                 # 이 기능을 쓰는 MCP 도구
 * figure: ScreenLayoutFigure       # aboutFigures.tsx의 그림 이름
 * prs: [103, 137]                  # 옛 PR 번호 (새 번호는 about/prs/<번호>.json 조각)
 * ui · port · was · ask            # 피드백 부위 이름 · 이식 안내서 · 옛 절 이름 · 확인 전 물음
 * ---
 * <!-- ko -->
 * - 지금 동작 한 항목 (**굵게**, `코드`, [링크](#/about/agents))
 *   이어지는 줄은 빈 줄 없이 들여 쓴다 (`코드` 안에서는 \ 이스케이프가 듣지 않는다)
 * ### 지킬 것
 * - 고칠 때 깨면 안 되는 것
 * ### 결정
 * - 2026-11-16 내 문단은 제안으로
 * <!-- en -->
 * - 같은 모양의 영어 (### Keep, ### Decisions)
 */
import { frontMatter } from './front-matter.js'

export type AboutInline = string | { b: AboutInline[] } | { code: string } | { a: AboutInline[]; href: string }
export type AboutLine = AboutInline[]

export interface AboutMdBody {
  /** 지금 동작: 항목마다 한 줄 */
  items: AboutLine[]
  /** 지킬 것: 고칠 때 깨면 안 되는 것 (있는 절만) */
  keep: AboutLine[]
  /** 결정: 날짜와 무엇을 한 줄씩 (있는 절만) */
  decisions: AboutLine[]
}

export interface AboutMd {
  id?: string
  title: { ko: string; en: string }
  summary?: { ko: string; en: string }
  ask?: { ko: string; en: string }
  ui?: string
  port?: string
  figure?: string
  code: string[]
  mcp: string[]
  prs: number[]
  was: string[]
  ko: AboutMdBody
  en: AboutMdBody
}

type Val = string | number | Val[] | { [k: string]: Val }

/** 'a' · "a"는 따옴표를 벗긴다 (안에 같은 따옴표가 없을 때만. "a" and "b"는 그대로) */
const unquote = (s: string) => {
  const t = s.trim()
  return /^'[^']*'$/.test(t) || /^"[^"]*"$/.test(t) ? t.slice(1, -1) : t
}
const scalar = (s: string): string => unquote(s)
/** [a, b] · { ko: x, en: y } 한 줄. 값에 쉼표를 쓰지 못한다: 쉼표가 있는 글은 들여 쓴 줄(ko: …)로 쓴다 */
function flow(s: string): Val {
  const t = s.trim()
  const close = t.startsWith('[') ? ']' : '}'
  if (!t.endsWith(close)) throw new Error(`소개 머리말의 괄호가 닫히지 않음: ${t}`)
  const inner = t.slice(1, -1).trim()
  const parts = inner ? inner.split(',').map((x) => x.trim()) : []
  if (close === ']') return parts.map(scalar)
  return Object.fromEntries(parts.map((p) => {
    const i = p.indexOf(':')
    if (i < 1) throw new Error(`소개 머리말 { } 안에 쉼표가 든 값: ${t} (들여 쓴 줄로 쓰세요)`)
    return [p.slice(0, i).trim(), scalar(p.slice(i + 1))]
  }))
}

/** 머리말: 맨 위 key: 값, 값이 없으면 들여 쓴 줄들(- 목록 또는 sub: 값) */
export function aboutYaml(yaml: string): Record<string, Val> {
  const out: Record<string, Val> = {}
  const lines = yaml.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!m) throw new Error(`소개 머리말을 읽지 못함: ${line}`)
    const key = m[1]!
    const v = m[2]!.trim()
    if (v.startsWith('[') || v.startsWith('{')) { out[key] = flow(v); continue }
    if (v) { out[key] = scalar(v); continue }
    const block: string[] = []
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) block.push(lines[++i]!.trim())
    out[key] = block[0]?.startsWith('- ')
      ? block.map((b) => scalar(b.slice(2)))
      : Object.fromEntries(block.map((b) => { const j = b.indexOf(':'); return [b.slice(0, j).trim(), unquote(b.slice(j + 1))] }))
  }
  return out
}

/** 한 줄 안의 **굵게** · `코드` · [글](주소) */
export function aboutInline(s: string): AboutLine {
  const out: AboutLine = []
  // \` · \* · \[ · \] · \\ 는 그 글자 그대로
  const re = /\\([\\`*[\]])|\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  const text = (t: string) => { if (typeof out[out.length - 1] === 'string') out[out.length - 1] += t; else out.push(t) }
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) text(s.slice(last, m.index))
    if (m[1] !== undefined) text(m[1])
    else if (m[2] !== undefined) out.push({ b: aboutInline(m[2]) })
    else if (m[3] !== undefined) out.push({ code: m[3] })
    else out.push({ a: aboutInline(m[4]!), href: m[5]! })
    last = m.index + m[0].length
  }
  if (last < s.length) text(s.slice(last))
  return out
}

const GROUPS: Record<string, keyof AboutMdBody> = { '지킬 것': 'keep', Keep: 'keep', '결정': 'decisions', Decisions: 'decisions' }

function body(text: string): AboutMdBody {
  const b: AboutMdBody = { items: [], keep: [], decisions: [] }
  let group: keyof AboutMdBody = 'items'
  let cur: string | undefined
  const flush = () => { if (cur !== undefined) b[group].push(aboutInline(cur)); cur = undefined }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { flush(); continue }
    if (/^<!--\s*ko\s*-->\s*$/.test(line)) { flush(); continue }
    const h = /^###\s+(.+)$/.exec(line)
    if (h) {
      flush()
      const g = GROUPS[h[1]!.trim()]
      if (!g) throw new Error(`소개 절의 모르는 칸: ${h[1]}`)
      group = g
      continue
    }
    if (line.startsWith('- ')) { flush(); cur = line.slice(2).trim(); continue }
    // 이어지는 줄은 항목 바로 밑에 들여 쓴다. 그 밖의 줄은 말없이 항목이 되지 않게 오류로
    if (/^\s+\S/.test(line) && cur !== undefined) { cur += ` ${line.trim()}`; continue }
    throw new Error(`소개 절 본문은 "- " 항목과 그 밑에 들여 쓴 줄, "### 칸"만 씁니다: ${line}`)
  }
  flush()
  return b
}

const pair = (v: Val | undefined): { ko: string; en: string } | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? { ko: String(v.ko ?? ''), en: String(v.en ?? '') } : undefined
const list = (v: Val | undefined): Val[] => (Array.isArray(v) ? v : v === undefined || v === '' ? [] : [v])

export function parseAboutMd(text: string): AboutMd {
  const fm = frontMatter(text)
  if (!fm) throw new Error('소개 절 파일에 머리말(---)이 없습니다')
  const y = aboutYaml(fm.yaml)
  const title = pair(y.title)
  if (!title?.ko || !title.en) throw new Error('소개 절 머리말에 title: { ko, en }이 없습니다')
  const halves = fm.body.split(/^<!--\s*en\s*-->\s*$/m)
  if (halves.length !== 2) throw new Error('소개 절 본문에 <!-- en --> 줄이 꼭 하나 있어야 합니다')
  const [ko = '', en = ''] = halves
  const str = (v: Val | undefined) => (v === undefined ? undefined : String(v))
  return {
    ...(str(y.id) && { id: str(y.id) }),
    title,
    ...(pair(y.summary) && { summary: pair(y.summary) }),
    ...(pair(y.ask) && { ask: pair(y.ask) }),
    ...(str(y.ui) && { ui: str(y.ui) }),
    ...(str(y.port) && { port: str(y.port) }),
    ...(str(y.figure) && { figure: str(y.figure) }),
    code: list(y.code).map(String),
    mcp: list(y.mcp).map(String),
    prs: list(y.prs).map(Number).filter(Boolean),
    was: list(y.was).map(String),
    ko: body(ko),
    en: body(en),
  }
}

/** 한 줄의 글자만 (검색 · 에이전트에게 건네는 글) */
export function aboutLineText(line: AboutLine): string {
  return line.map((x) => (typeof x === 'string' ? x : 'b' in x ? aboutLineText(x.b) : 'code' in x ? x.code : aboutLineText(x.a))).join('')
}

/** 파일 경로가 glob(** · * · ?)에 맞는가 */
export function aboutGlobMatch(glob: string, file: string): boolean {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*')
  return new RegExp(`^${re}$`).test(file)
}
