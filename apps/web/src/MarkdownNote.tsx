import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditView } from './NoteToolbar'
import { publishToc } from './noteScreen'
import { conceptsApi, type BibEntry, type ResearchApi } from './api'
import { ConceptEditor } from './ConceptEditor'
import { COMMON_COMMANDS, type Command } from './conceptCommands'
import { OPTIONAL_AUX_NOTE_COMMANDS } from './auxNoteCommands'
import { useConceptRender } from './ConceptNotes'
import { CITE_EVENT, citeKeys } from './citeKeys'
import type { RenderOptions } from './ObsidianMarkdown'
import { NoteMarkdown } from './NoteMarkdown'
import { go } from './router'
import { NoteAsk, type CommentTarget } from './Comments'
import { askConfirm } from './askText'
import { t } from './i18n'
import { frontMatterEnd } from '@rw/core'

/**
 * 연구노트·보조 노트의 Markdown + KaTeX 본문 (10/4 결정: 개념노트와 같은 형식과 편집기).
 * 읽기가 기본이고, 고치기를 누르면 개념노트 편집기(바로 보기, "/"·⌘K 명령, [[ ]]·[@ ] 찾기)가 열린다.
 * 머리말(--- … ---)은 여기서 고치지 않는다: 저장할 때 그 글자를 그대로 앞에 붙인다.
 */

/** 연구노트 틀 (10/4): 절은 ## 제목. 커지면 하위 노트 대신 이어지는 노트를 따로 만든다 */
export const RESEARCH_NOTE_COMMANDS: Command[] = [
  { label: t('연구노트 틀', 'Research note outline'), detail: '목표 · 진행 · 결과 · 남은 문제', tpl: '## 목표\n\n${}\n\n## 진행\n\n## 결과\n\n## 남은 문제\n' },
  { label: t('목표', 'Goal'), detail: '## 목표', tpl: '## 목표\n\n${}' },
  { label: t('결과', 'Result'), detail: '## 결과', tpl: '## 결과\n\n${}' },
  { label: t('남은 문제', 'Open problems'), detail: '## 남은 문제', tpl: '## 남은 문제\n\n- ${}' },
  { label: t('이어지는 노트', 'Next notes'), detail: '## 이어지는 노트 [[ ]]', tpl: '## 이어지는 노트\n\n- [[${}]]', then: 'link' },
  { label: t('증명', 'Proof'), detail: t('**Proof.** … ∎ (접힘)', '**Proof.** … ∎ (folded)'), tpl: '**Proof.** ${} ∎' },
  ...COMMON_COMMANDS,
]

/** 보조 노트 틀: 주장 하나 (보조정리·유도·계산·열린 문제) */
export const AUX_NOTE_COMMANDS: Command[] = [
  { label: t('주장 노트 틀', 'Claim note outline'), detail: '주장 · 증명 · 남은 것', tpl: '## 주장\n\n${}\n\n## 증명\n\n**Proof.** ∎\n\n## 남은 것\n' },
  { label: t('주장', 'Claim'), detail: '## 주장', tpl: '## 주장\n\n${}' },
  { label: t('증명', 'Proof'), detail: t('**Proof.** … ∎ (접힘)', '**Proof.** … ∎ (folded)'), tpl: '**Proof.** ${} ∎' },
  { label: t('계산', 'Calculation'), detail: '## 계산', tpl: '## 계산\n\n$$\n${}\n$$' },
  ...OPTIONAL_AUX_NOTE_COMMANDS,
  ...COMMON_COMMANDS,
]


/** 기호 모음(공유 기호 파일) + 이 노트에서 처음 나온 순서의 인용 번호 + bib의 제목 */
export function useNoteRender(text: string, rapi: ResearchApi, rid?: string): RenderOptions {
  const base = useConceptRender(rid)
  const [bib, setBib] = useState<BibEntry[] | null>(null)
  useEffect(() => { rapi.materials().then((d) => setBib(d.bib)).catch(() => setBib([])) }, [rapi])
  const keys = useMemo(() => citeKeys(text), [text])
  return useMemo(() => {
    const byKey = new Map((bib ?? []).map((e) => [e.key, e]))
    return {
      ...base,
      // 예전 LaTeX 노트에서 옮긴 명령 가운데 KaTeX에 없는 것 (파일은 그대로 두고 그릴 때만)
      macros: { '\\Tilde': '\\tilde', ...base.macros },
      cite: (k: string) => { const i = keys.indexOf(k); return i >= 0 ? String(i + 1) : '?' },
      citeTitle: (k: string) => { const e = byKey.get(k); return e ? [e.author?.split(/\s+and\s+/)[0], e.year, e.title].filter(Boolean).join(' · ') : k },
    }
  }, [base, keys, bib])
}

/** [[링크]]를 누르면 그 개념노트를 이 프로젝트 작업 화면에서 연다 */
export function followLink(rid: string, e: React.MouseEvent): void {
  const target = (e.target as HTMLElement).closest('.ob-link')?.getAttribute('title')?.replace(/#.*$/, '').split('/').pop()
  const cite = (e.target as HTMLElement).closest('.ob-cite')
  if (cite) {
    e.preventDefault()
    // [1]을 누르면 아래 "인용한 논문"을 펼치고 그 논문을 고른다 (10/7 19:42)
    const key = cite.getAttribute('data-keys')?.split(' ')[0]
    const box = (e.currentTarget as HTMLElement).querySelector('.cited')
    if (key && box) box.dispatchEvent(new CustomEvent(CITE_EVENT, { detail: key }))
    return
  }
  if (!target) return
  void conceptsApi.resolve(target).then((r) => { if (r) go({ page: 'concept', rid, id: r.id }) }).catch(() => {})
}

/**
 * 본문 읽기·고치기. text는 파일 전체, onSave는 파일 전체를 받는다 (머리말은 지금 파일의 것 그대로).
 * editing은 바깥이 가진다 (노트 도구 줄의 고치기).
 * view·onDraft를 주면 노트 도구 줄이 보기를 바꾸고 고칠 때마다 파일 전체를 받아 저절로 저장한다 (10/5 노트 도구 줄 "편집 완료").
 */
export function MarkdownNoteBody({ rid, text, rapi, kind, editing, saving, onSave, onCancel, empty, head, footer, file, target, view, onDraft, tocOwner }: {
  rid: string; text: string; rapi: ResearchApi; kind: 'note' | 'aux'; editing: boolean; saving: boolean
  /** 글을 골라 남기는 질문의 대상 (Comments.tsx) */
  target?: CommentTarget | null
  /** 연구노트 파일 (그 폴더의 그림을 보여 줄 때) */
  file?: string
  onSave(full: string): void; onCancel(): void
  /** 본문이 비었을 때 읽기 화면에 보일 말 */
  empty?: string
  /** 본문 위에 함께 스크롤할 것 (노트 머리: 제목과 상태) */
  head?: React.ReactNode
  /** 본문 끝에 함께 스크롤할 것 (인용한 논문) */
  footer?: React.ReactNode
  view?: EditView
  onDraft?(full: string): void
  /** 이 노트가 지금 칸에서 보이면 그 탭 key: 왼쪽 사이드바 맨 아래 절 목차에 알린다 */
  tocOwner?: string | null
}) {
  const start = frontMatterEnd(text)
  const body = text.slice(start)
  const options = useNoteRender(body, rapi, rid)
  // 원고 그림 API는 연구·계산 노트만 받는다. 보조 노트의 로컬 그림은 읽기처럼 파일 위젯으로 둔다.
  const asset = useMemo(() => (file && kind === 'note' ? (name: string) => rapi.noteAssetUrl(file, name) : undefined), [file, kind, rapi])
  const scroller = useRef<HTMLDivElement>(null)
  useNoteSections(scroller, editing ? null : tocOwner ?? null, body)
  if (editing) {
    const front = text.slice(0, frontMatterEnd(text))
    return (
      <div className="md-note-editing">
        {head}
        <NoteAsk rid={rid} target={target ?? null} source={text} contentOffset={start}><ConceptEditor initial={body} options={options} notePreview asset={asset} saving={saving} editView={view}
          commands={kind === 'note' ? RESEARCH_NOTE_COMMANDS : AUX_NOTE_COMMANDS}
          label={kind === 'note' ? t('연구노트 본문', 'Research note body') : t('노트 본문', 'Note body')}
          hint={kind === 'note' ? t('## 제목으로 절을 나눕니다. "/"로 틀과 수식을 넣을 수 있습니다.', 'Split sections with ## headings. Type "/" to insert outlines and math.') : t('주장 하나를 적습니다. "/"로 틀과 수식을 넣을 수 있습니다.', 'Write one claim. Type "/" to insert outlines and math.')}
          onChange={onDraft && ((b) => onDraft(front + b))}
          onSave={(b) => onSave(front + b)}
          onCancel={(dirty) => {
            // 저절로 저장하는 화면에서는 Esc가 "편집 완료"이다
            if (onDraft) return onCancel()
            void (async () => { if (!dirty || await askConfirm({ title: t('고친 내용을 버릴까요?', 'Discard your edits?'), hint: t('저장하지 않은 고침이 사라집니다.', 'Unsaved edits will be lost.'), ok: t('버리기', 'Discard') })) onCancel() })()
          }} /></NoteAsk>
      </div>
    )
  }
  return (
    <div ref={scroller} className="scroll md-note-read" onClick={(e) => followLink(rid, e)} data-ui="노트 본문">
      {head}
      <div className="page-body cn-body md-note-body">
        {body.trim() ? <NoteAsk rid={rid} target={target ?? null} source={text} contentOffset={start}><NoteMarkdown text={body} options={options} asset={asset} /></NoteAsk> : <p className="muted">{empty ?? t('아직 본문이 없습니다. 고치기를 눌러 적습니다.', 'No text yet. Click Edit to write.')}</p>}
        {footer}
      </div>
    </div>
  )
}

/**
 * 목차에 쓸 제목 글자. KaTeX는 수식을 MathML(TeX 원문 포함)과 HTML 두 벌로 그려 textContent가 "nnn", "ctotc_\text{tot}ctot"처럼 겹친다:
 * 화면에 보이는 HTML 쪽만 쓰고, KaTeX가 넣는 폭 없는 빈칸은 뺀다
 */
function headingTitle(h: Element): string {
  const c = h.cloneNode(true) as Element
  c.querySelectorAll('.katex-mathml').forEach((m) => m.remove())
  return (c.textContent ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * 읽는 본문의 절(h2·h3)을 왼쪽 사이드바 맨 아래 목차에 알린다 (10/5 시안 "절 목차": 스크롤을 따라 지금 절 표시, 누르면 그 절로).
 * owner가 null이면(다른 칸·탭) 알리지 않는다. 작업 보고서도 같은 목차를 쓴다(heads: 절 제목을 고르는 선택자, 제목의 offsetParent는 scroller)
 */
export function useNoteSections(scroller: React.RefObject<HTMLDivElement | null>, owner: string | null, body: string, heads$ = '.md-note-body h2, .md-note-body h3') {
  useEffect(() => {
    const el = scroller.current
    if (!owner || !el) return
    let heads: HTMLElement[] = []
    const jump = (i: number) => { const h = heads[i]; if (h) el.scrollTo({ top: h.offsetTop - 8, behavior: 'smooth' }) }
    const update = () => {
      heads = [...el.querySelectorAll<HTMLElement>(heads$)]
      const y = el.scrollTop + 24
      let current = heads.length ? 0 : -1
      heads.forEach((h, i) => { if (h.offsetTop <= y) current = i })
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4 && heads.length) current = heads.length - 1
      publishToc({ owner, current, jump, sections: heads.map((h) => ({ title: headingTitle(h), level: h.tagName === 'H2' ? 2 : 3 })) }, owner)
    }
    // 수식·그림이 늦게 그려져 높이가 바뀌므로 잠깐 뒤에도 다시 잰다
    const t = window.setTimeout(update, 300)
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => { window.clearTimeout(t); el.removeEventListener('scroll', update); publishToc(null, owner) }
  }, [scroller, owner, body, heads$])
}
