import katex from 'katex'
import 'katex/dist/katex.min.css'
import MarkdownIt from 'markdown-it'
import { useMemo, useRef } from 'react'
import { useRecordPaint } from './recordPaint'

/**
 * Study(Obsidian) 노트를 Obsidian에서처럼 그린다 (읽기만).
 * - 수식: $…$, $$…$$ (여러 줄, align 등 환경 포함. 콜아웃 안의 "> "는 떼고 계산)
 * - [[대상|별칭]] 위키링크, ![[그림.png|500]] 그림(이름으로 Study 안에서 찾음), ==강조==
 * - 콜아웃: > [!note] 제목 → 상자
 * 마크다운 해석 전에 수식·링크를 자리표시로 떼어 두었다가, 해석한 HTML에 되돌려 넣는다 (마크다운이 \ · _ · * 를 망가뜨리지 않게).
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false })

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i

/** 그리는 방법 (개념노트용): 기호 모음(KaTeX macros)과 그림 주소 */
export interface RenderOptions {
  macros?: Record<string, string>
  assetUrl?(name: string): string
  /** 본문 인용 [@키; @키]의 번호 (개념노트: 그 노트에서 처음 나온 순서). 없으면 글 그대로 */
  cite?(key: string): string
  /** 인용에 마우스를 올렸을 때 보일 글 (저자·연도·제목) */
  citeTitle?(key: string): string
  /** ![[이름]]이 그림 라이브러리의 그림이면 그 주소 (figureEmbed.ts). PDF 그림은 노트 화면이 첫 쪽을 그린다 */
  figure?(name: string): { url: string; pdf: boolean } | undefined
}

/** Pandoc 꼴 인용: [@a], [@a; @b], [see @a, p. 3]. 뒤에 (가 오면 링크라서 아님 */
export const CITE = /(?<!\\)\[((?:[^\[\]]*?(?:(?<=\[)|[\s;])-?@[A-Za-z0-9_:.\-]*[A-Za-z0-9_][^\[\]]*?)+)\](?!\()/g
/** "1, 3, 4, 5" → "1, 3–5" (숫자가 아니면 그대로) */
export function citeNumbers(labels: string[]): string {
  const nums = labels.map(Number)
  if (nums.some((n) => !Number.isInteger(n))) return labels.join(', ')
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    out.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(', '))
    i = j
  }
  return out.join(', ')
}
export const citeKeys = (inner: string) => [...inner.matchAll(/(?:^|[\s;])-?@([A-Za-z0-9_:.\-]*[A-Za-z0-9_])/g)].map((m) => m[1]!)

const studyAsset = (name: string) => `/api/study/asset?name=${encodeURIComponent(name)}`

export function renderObsidian(src: string, opts: RenderOptions = {}): string {
  // KaTeX는 macros 객체에 \gdef를 적어 넣을 수 있어 수식마다 새로 복사한다
  const k = (tex: string, displayMode: boolean) => katex.renderToString(tex, { displayMode, throwOnError: false, ...(opts.macros && { macros: { ...opts.macros } }) })
  const asset = opts.assetUrl ?? studyAsset
  const slots: string[] = []
  const hold = (html: string) => `\u0001${slots.push(html) - 1}\u0001`

  let text = src.replace(/\r\n/g, '\n')
  // 코드 블록은 그대로 둔다 (그 안의 $·[[ ]]는 바꾸지 않게)
  text = text.replace(/```[\s\S]*?```/g, (m) => hold(md.render(m)))
  // 표시 수식 $$…$$ — 콜아웃 안이면 줄 앞 "> "를 뗀다
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    hold(k(tex.replace(/^\s*>\s?/gm, '').trim(), true)))
  // 글 속 수식 $…$ (한 줄 안, 앞뒤가 공백이 아닌 것)
  text = text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, tex: string) => hold(k(tex, false)))
  // ![[그림|폭]] 과 [[대상#절|별칭]]
  text = text.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, name: string, opt?: string) => {
    const file = name.trim()
    const width = opt && /(\d+)/.exec(opt)?.[1]
    const style = width ? ` style="max-width:min(100%,${width}px)"` : ''
    const fig = opts.figure?.(file)
    if (fig) return hold(fig.pdf ? `<canvas class="md-fig-pdf ob-fig" data-src="${esc(fig.url)}" aria-label="${esc(file)}"${style}></canvas>` : `<img class="ob-img ob-fig" src="${esc(fig.url)}" alt="${esc(file)}"${style}>`)
    if (!IMAGE.test(file)) return hold(`<span class="ob-embed" title="${esc(file)}">↪ ${esc(file)}</span>`)
    return hold(`<img class="ob-img" src="${esc(asset(file))}" alt="${esc(file)}"${style}>`)
  })
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) =>
    hold(`<span class="ob-link" role="link" tabindex="0" title="${esc(target.trim())}">${esc((alias ?? target).trim().replace(/#.*$/, (h) => (alias ? '' : ` › ${h.slice(1)}`)))}</span>`))
  const cite = opts.cite
  if (cite) text = text.replace(CITE, (whole, inner: string) => {
    const keys = citeKeys(inner)
    if (!keys.length) return whole
    // 쪽수 등 꼬리말: [@a, p. 3] → [1, p. 3]
    const tail = /,\s*([^;@]*\S)\s*$/.exec(inner.replace(/.*@[A-Za-z0-9_:.\-]*[A-Za-z0-9_]/, ''))?.[1]
    return hold(`<a class="ob-cite" href="#" data-keys="${esc(keys.join(' '))}" title="${esc(keys.map((k) => opts.citeTitle?.(k) ?? k).join('\n'))}">[${esc(citeNumbers(keys.map(cite)))}${tail ? `, ${esc(tail)}` : ''}]</a>`)
  })
  text = text.replace(/==([^=\n]+)==/g, (_, t: string) => hold(`<mark>${md.renderInline(t)}</mark>`))

  // 증명은 접어 둔다 (10/4 17:09): "**증명.**"·"*Proof.*"로 시작하는 문단부터 □·∎로 끝나는 문단(또는 다음 제목 앞)까지
  const tokens = md.parse(text, {})
  foldProofs(tokens, (s) => s.replace(/\u0001(\d+)\u0001/g, (_, n: string) => slots[Number(n)] ?? ''))
  let html = md.renderer.render(tokens, md.options, {})
  // 콜아웃: <blockquote><p>[!type] 제목<br> …  또는  <blockquote><p>[!type] 제목</p>
  html = html.replace(/<blockquote>\s*<p>\[!(\w+)\]([+-]?)[ \t]*([^<\n]*)(<br>\n?|<\/p>)/g, (_, type: string, _fold: string, title: string, end: string) =>
    `<blockquote class="ob-callout" data-type="${esc(type.toLowerCase())}"><div class="ob-callout-title">${title.trim() || esc(type)}</div>${end.startsWith('<br') ? '<p>' : ''}`)
  // 자리표시를 되돌린다 (자리표시 안에 또 자리표시가 있을 수 있어 몇 번)
  for (let i = 0; i < 3 && html.includes('\u0001'); i++) html = html.replace(/\u0001(\d+)\u0001/g, (_, n: string) => slots[Number(n)] ?? '')
  return html
}

type Token = ReturnType<typeof md.parse>[number]
const PROOF_START = /^(?:(\*\*|\*|__|_)(증명|Proof)\.?\1\.?|(증명|Proof)\.)\s*/i
const PROOF_END = /(?:[□∎■]|\\square|\\blacksquare|\\Box)\s*[.)]?\s*$/

/** 증명 문단들을 <details>로 감싼다. 끝 표시(□ ∎)가 없으면 다음 제목 앞까지 */
export function foldProofs(tokens: Token[], expand: (s: string) => string): void {
  const Tok = tokens[0]?.constructor as (new (type: string, tag: string, nesting: number) => Token) | undefined
  if (!Tok) return
  const htmlTok = (content: string) => Object.assign(new Tok('html_block', '', 0), { content })
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    const inline = tokens[i + 1]
    if (t.type !== 'paragraph_open' || t.level !== 0 || inline?.type !== 'inline') continue
    const m = PROOF_START.exec(inline.content)
    if (!m) continue
    const word = m[2] ?? m[3] ?? '증명'
    inline.content = inline.content.slice(m[0].length)
    inline.children = md.parseInline(inline.content, {})[0]?.children ?? []
    // 최상위 블록을 하나씩: □·∎로 끝나는 블록까지, 또는 다음 제목 바로 앞까지
    let end = i
    for (let j = i; j < tokens.length;) {
      if (j !== i && tokens[j]!.type === 'heading_open' && tokens[j]!.level === 0) break
      let k = j
      if (tokens[j]!.nesting === 1) for (let depth = 0; k < tokens.length; k++) { depth += tokens[k]!.nesting; if (depth === 0) break }
      end = k
      const text = tokens.slice(j, k + 1).filter((x) => x.type === 'inline').map((x) => expand(x.content).replace(/<[^>]*>/g, '')).join(' ')
      if (PROOF_END.test(text.trim())) break
      j = k + 1
    }
    tokens.splice(end + 1, 0, htmlTok('</details>\n'))
    tokens.splice(i, 0, htmlTok(`<details class="ob-proof"><summary>${esc(word)}</summary>\n`))
    i = end + 2
  }
}

export function ObsidianMarkdown({ text, options }: { text: string; options?: RenderOptions }) {
  const html = useMemo(() => renderObsidian(text, options), [text, options])
  // 개념노트 본문은 고른 글 메모의 하이라이트를 칠한다 (RecordContext가 있을 때만)
  const ref = useRef<HTMLDivElement>(null)
  const openMark = useRecordPaint(ref, html)
  return <div className="ob-md" ref={ref} onClick={(event) => { openMark(event) }} onKeyDown={(event) => { openMark(event) }} dangerouslySetInnerHTML={{ __html: html }} />
}
