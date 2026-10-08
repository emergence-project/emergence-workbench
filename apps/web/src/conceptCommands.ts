import { autocompletion, type Completion, type CompletionContext, type CompletionResult, snippet, startCompletion } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { conceptsApi } from './api'
import { slashQuery } from './conceptLiveParse'
import { t } from './i18n'

/**
 * 개념노트 편집기의 명령 메뉴: 줄 머리나 빈칸 뒤에서 "/"를 치거나 ⌘K.
 * 본문 틀(Definition → Properties와 Proof → Examples), 수식, 개념 링크, 출처 인용을 넣는다.
 * `[[`를 치면 개념노트 이름을, `[@`를 치면 references.bib 항목을 찾아 준다.
 */
export interface Command { label: string; detail: string; tpl: string; then?: 'link' | 'cite' }
const COMMANDS: Command[] = [
  // 기본 양식 (10/4 17:09, 서버 CONCEPT_TEMPLATE과 같게): ## Definition 필수, Remarks는 쓸 때만. 절 구성은 나중에 바꿀 수 있다
  { label: t('개념노트 틀', 'Concept note template'), detail: 'Definition · Properties · Examples', tpl: '## Definition\n\n${}\n\n## Properties\n\n1. \n\n**Proof.** ∎\n\n## Examples\n' },
  { label: t('정의', 'Definition'), detail: '## Definition', tpl: '## Definition\n\n${}' },
  { label: t('성질', 'Properties'), detail: '## Properties', tpl: '## Properties\n\n1. ${}' },
  { label: t('증명', 'Proof'), detail: t('**Proof.** … ∎ (접힘)', '**Proof.** … ∎ (folds)'), tpl: '**Proof.** ${} ∎' },
  { label: t('예', 'Examples'), detail: '## Examples', tpl: '## Examples\n\n${}' },
  { label: t('참고', 'Remarks'), detail: '## Remarks', tpl: '## Remarks\n\n${}' },
  { label: t('제목', 'Heading'), detail: t('## 제목', '## Heading'), tpl: '## ${}' },
  { label: t('작은 제목', 'Subheading'), detail: t('### 제목', '### Heading'), tpl: '### ${}' },
  { label: t('수식 블록', 'Display math'), detail: '$$ … $$', tpl: '$$\n${}\n$$' },
  { label: t('줄 안 수식', 'Inline math'), detail: '$ … $', tpl: '$${}$' },
  { label: t('개념 링크', 'Concept link'), detail: t('[[이름]]', '[[name]]'), tpl: '[[${}]]', then: 'link' },
  { label: t('출처 인용', 'Cite source'), detail: t('[@키]', '[@key]'), tpl: '[@${}]', then: 'cite' },
  { label: t('목록', 'List'), detail: '- ', tpl: '- ${}' },
  { label: t('번호 목록', 'Numbered list'), detail: '1. ', tpl: '1. ${}' },
  { label: t('굵게', 'Bold'), detail: t('**글**', '**text**'), tpl: '**${}**' },
  { label: t('기울임', 'Italic'), detail: t('*글*', '*text*'), tpl: '*${}*' },
  { label: t('인용문', 'Quote'), detail: '> ', tpl: '> ${}' },
  { label: t('코드', 'Code'), detail: '``` … ```', tpl: '```\n${}\n```' },
  { label: t('표', 'Table'), detail: '| | |', tpl: '| ${} |  |\n| --- | --- |\n|  |  |' },
]

/** 개념노트 틀이 아닌 공통 명령 (제목, 수식, 링크, 인용 …): 연구노트·보조 노트도 쓴다 */
export const COMMON_COMMANDS = COMMANDS.slice(COMMANDS.findIndex((c) => c.tpl === '## ${}'))

/** slash: "/"까지 지운다 (찾는 말은 "/" 뒤부터 거른다) */
function commandOptions(slash: boolean, list: Command[]): Completion[] {
  return list.map((c, i) => ({
    label: c.label,
    detail: c.detail,
    boost: -i, // 본문 틀 순서대로
    apply: (view: EditorView, comp: Completion, from: number, to: number) => {
      snippet(c.tpl)(view, comp, slash ? from - 1 : from, to)
      if (c.then) setTimeout(() => startCompletion(view), 0)
    },
  }))
}

const commandSource = (list: Command[]) => (ctx: CompletionContext): CompletionResult | null => {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const q = slashQuery(line.text.slice(0, ctx.pos - line.from))
  if (q !== null) return { from: ctx.pos - q.length, options: commandOptions(true, list), validFor: /^[^\s/]*$/ }
  // ⌘K(또는 Ctrl+Space): 커서 자리에서 바로
  if (ctx.explicit && !ctx.matchBefore(/\[\[[^\]\n]*|\[@[^\]\n]*/)) return { from: ctx.pos, options: commandOptions(false, list) }
  return null
}

async function linkSource(ctx: CompletionContext): Promise<CompletionResult | null> {
  const m = ctx.matchBefore(/\[\[[^\]\n|#]*/)
  if (!m) return null
  const q = m.text.slice(2)
  const items = await conceptsApi.list({ q: q || undefined, limit: 20, showEmpty: true }).then((r) => r.items).catch(() => [])
  if (ctx.aborted) return null
  const close = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === ']]' ? '' : ']]'
  return {
    from: m.from + 2,
    filter: false,
    options: items.map((r) => ({ label: r.title, detail: r.subject || undefined, info: r.aliases.length ? t(`다른 이름: ${r.aliases.join(', ')}`, `Also called: ${r.aliases.join(', ')}`) : undefined, apply: r.title + close })),
  }
}

export async function citeSource(ctx: CompletionContext): Promise<CompletionResult | null> {
  // 띄어쓰기도 받는다: "[@sample kempe 2020"처럼 저자·제목·연도 낱말로 찾고, 고르면 키로 바뀐다
  const m = ctx.matchBefore(/@[^\]\n;,]*/)
  if (!m || !/\[[^\]\n]*$/.test(ctx.state.sliceDoc(ctx.state.doc.lineAt(m.from).from, m.from))) return null
  const items = await conceptsApi.bib(m.text.slice(1)).catch(() => [])
  if (ctx.aborted) return null
  const close = /^[\];]/.test(ctx.state.sliceDoc(ctx.pos, ctx.pos + 1)) ? '' : ']'
  return {
    from: m.from + 1,
    filter: false,
    options: items.map((e) => ({ label: e.key, section: t('키·저자·제목·연도 낱말로 찾기', 'Search by key, author, title or year'), detail: [[e.author?.split(/ and /)[0], e.year].filter(Boolean).join(', '), e.title].filter(Boolean).join(' · ') || undefined, info: e.title, apply: e.key + close })),
  }
}

/** commands: 명령 목록 (빼면 개념노트 틀과 공통 명령) — 연구노트·보조 노트는 자기 틀 + COMMON_COMMANDS */
export function conceptCommands(commands: Command[] = COMMANDS) {
  return autocompletion({ override: [commandSource(commands), linkSource, citeSource], icons: false, closeOnBlur: true })
}
