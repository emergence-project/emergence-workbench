import type { LatexTemplate } from '@rw/core'
import * as pdfjs from 'pdfjs-dist'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { latexApi, type LatexSetupView } from './api'
import { Icon } from './icons'
import { LatexMacros } from './LatexMacros'
import './PdfView'
import { askConfirm } from './askText'
import { shown as stored, t } from './i18n'

/**
 * 설정 › LaTeX: 편집기와 서식 (10/4 19:29 "Latex 탭 두개 합치고, 서브섹션으로 만들어").
 * 서식은 미리보기 카드 모음이다 (10/4 19:30 "라이브러리 카드를 만들고, 미리보기로 만들어. documentclass 별로 분류하고, 필요하다면 태그도.
 * 서식의 설정은 클릭하기 전까지 띄우지마"). 카드는 같은 예문을 그 서식으로 컴파일한 첫 쪽을 보이고, 누르면 아래에 그 서식의 설정이 열린다.
 * 서식마다 문서 종류 줄, 공통 줄(\input{setting}), setting.tex에 넣을 패키지를 정한다.
 * 이 컴퓨터의 앱 설정(config.yaml의 latexTemplates:)에만 저장하고, 연구 파일은 바꾸지 않는다. 저자는 내보낼 때 고른다.
 */
export function LatexSetupPage({ onSaved, editor, scrollTo }: { onSaved(message: string): void; editor: ReactNode; scrollTo?: string }) {
  const [view, setView] = useState<LatexSetupView | null>(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const detail = useRef<HTMLElement>(null)
  useEffect(() => { latexApi.get().then(setView).catch((e: Error) => setError(e.message)) }, [])
  useEffect(() => { if (view && scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ block: 'start' }) }, [view, scrollTo])
  useEffect(() => { if (sel) detail.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [sel])

  const run = async (p: Promise<LatexSetupView>, message: string) => {
    try {
      const v = await p
      setView(v)
      onSaved(message)
      return v
    } catch (e) { onSaved(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Could not save: ${(e as Error).message}`)); return null }
  }

  if (!view) return <main className="stage full" data-ui="LaTeX 서식"><p className="muted" style={{ padding: 'var(--sp-5)' }}>{error || t('불러오는 중…', 'Loading…')}</p></main>
  const { templates, defaultTemplate, packages, previews } = view
  const cur = templates.find((x) => x.id === sel) ?? null
  const tags = [...new Set(templates.flatMap((x) => x.tags ?? []))]
  const shown = templates.filter((x) => !tag || x.tags?.includes(tag))
  // documentclass별로 묶는다 (article, revtex4-1, beamer …). 묶음 차례는 처음 나온 차례
  const groups = new Map<string, LatexTemplate[]>()
  for (const x of shown) groups.set(classOf(x), [...(groups.get(classOf(x)) ?? []), x])

  const save = (id: string, name: string, patch: Partial<LatexTemplate>) => void run(latexApi.saveTemplate(id, patch), t(`저장했습니다 — ${name}`, `Saved: ${name}`))
  const copy = async (x: LatexTemplate) => {
    const v = await run(latexApi.addTemplate(x.id), t(`${x.name}을 복사해 새 서식을 만들었습니다`, `Created a new template from a copy of ${x.name}`))
    if (v && 'created' in v) setSel((v as LatexSetupView & { created: string }).created)
  }
  const remove = async (x: LatexTemplate) => {
    if (!await askConfirm({ title: t(`"${x.name}" 서식을 지울까요?`, `Delete template "${x.name}"?`), hint: t('이 컴퓨터의 앱 설정에서만 지워지고, 이 서식으로 만든 노트와 PDF는 그대로 남습니다.', 'It is removed only from this computer\'s app settings. Notes and PDFs made with it stay.'), ok: t('지우기', 'Delete') })) return
    void run(latexApi.removeTemplate(x.id), t(`${x.name} 서식을 지웠습니다`, `Deleted template ${x.name}`)).then(() => setSel(null))
  }

  return (
    <main className="stage full" data-ui="LaTeX 서식">
      <section className="pane">
        <div className="scroll">
          <div className="page-body">
            {editor}

            <section id="latex-templates" data-ui="서식 모음">
              <div className="sec-head">
                <h2>{t('서식', 'Templates')}</h2><span className="count">{t(`${templates.length}개`, `${templates.length}`)}</span><span className="sp" />
                {tags.length > 0 && (
                  <div className="segmented small" role="radiogroup" aria-label={t('태그 필터', 'Tag filter')} data-ui="서식 거르기">
                    {[null, ...tags].map((g) => (
                      <button key={g ?? ''} role="radio" aria-checked={tag === g} className={tag === g ? 'on' : ''} onClick={() => setTag(g)}>{g === null ? t('모두', 'All') : stored(g)}</button>
                    ))}
                  </div>
                )}
              </div>
              <p className="set-desc tex-note" title={t('같은 예문을 각 서식으로 컴파일한 첫 쪽입니다. 내보낼 때 처음에는 프로젝트 서식이나 내보내기 기본 서식이 골라집니다.', 'The first page of the same sample compiled with each template. Export starts with the project template or the default export template.')}>{t('카드를 누르면 서식을 고칩니다.', 'Click a card to edit the template.')}</p>
              {[...groups].map(([cls, list]) => (
                <div key={cls} className="tpl-group" data-ui="서식 묶음">
                  <div className="tpl-group-name"><code>{cls}</code><span className="muted">{list.length}</span></div>
                  <div className="tpl-grid">
                    {list.map((x) => (
                      <button key={x.id} className={`tpl-card${x.id === sel ? ' on' : ''}`} data-ui="서식 카드" aria-expanded={x.id === sel} title={t('누르면 이 서식의 설정이 열립니다', 'Click to open this template\'s settings')} onClick={() => setSel(x.id === sel ? null : x.id)}>
                        <TemplateThumb id={x.id} version={JSON.stringify(x)} />
                        <span className="tpl-card-name">{stored(x.name)}</span>
                        <span className="tpl-card-tags">
                          {x.id === defaultTemplate && <span className="tag">{t('내보내기 기본', 'Default for export')}</span>}
                          {(x.tags ?? []).map((g) => <span key={g} className="tag">{stored(g)}</span>)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {cur && (
              <section className="tpl-detail" ref={detail} data-ui="서식 설정">
                <div className="tpl-detail-head">
                  <h2>{stored(cur.name)}</h2>
                  <span className="sp" />
                  <button className="btn" onClick={() => void copy(cur)}>{t('복사해 새 서식 만들기', 'Copy as new template')}</button>
                  <button className="btn" disabled={cur.id === defaultTemplate} title={t('노트를 내보낼 때 처음에 골라 둘 서식', 'The template picked first when exporting notes')} onClick={() => void run(latexApi.setDefault(cur.id), t(`내보낼 때 ${cur.name}을 씁니다`, `Export now uses ${cur.name}`))}>{t('내보내기 기본으로', 'Set as default for export')}</button>
                  <button className="icon-btn" disabled={templates.length <= 1} title={t('지우기 — 이 서식을 앱 설정에서 지웁니다', 'Delete this template from the app settings')} aria-label={t('지우기', 'Delete')} onClick={() => void remove(cur)}>{Icon.trash}</button>
                  <button className="icon-btn" title={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={() => setSel(null)}>{Icon.x}</button>
                </div>

                <div className="tex-form" data-ui="문서 틀">
                  <TextField ui="이름" label={t('이름', 'Name')} value={cur.name} line plain onSave={(v) => save(cur.id, cur.name, { name: v })} />
                  <TextField ui="태그 (쉼표로 나눔)" label={t('태그 (쉼표로 나눔)', 'Tags (comma separated)')} value={(cur.tags ?? []).join(', ')} line plain placeholder={t('논문, 노트, 발표', 'paper, note, talk')} onSave={(v) => save(cur.id, cur.name, { tags: v.split(/[,，]/).map((x) => x.trim()).filter(Boolean) })} />
                  <div className="field" data-ui="종류">
                    <span>{t('종류', 'Kind')}</span>
                    <div className="segmented small" role="radiogroup">
                      {(['document', 'slides'] as const).map((k) => (
                        <button key={k} role="radio" aria-checked={cur.kind === k} className={cur.kind === k ? 'on' : ''} onClick={() => save(cur.id, cur.name, { kind: k })}>{k === 'document' ? t('문서', 'Document') : t('발표 (노트 PDF에는 쓰지 않음)', 'Slides (not used for note PDFs)')}</button>
                      ))}
                    </div>
                  </div>
                  <TextField ui="문서 종류" label={t('문서 종류', 'Document class')} value={cur.documentClass} line onSave={(v) => save(cur.id, cur.name, { documentClass: v })} />
                  <TextField ui="공통 줄 (문서 종류 다음, \begin{document} 앞)" label={t('공통 줄 (문서 종류 다음, \\begin{document} 앞)', 'Shared lines (after the document class, before \\begin{document})')} value={cur.preamble} rows={3} onSave={(v) => save(cur.id, cur.name, { preamble: v })} />
                </div>

                <div data-ui="패키지">
                  <h3 className="tpl-h">{t('패키지', 'Packages')} <span className="muted">{t(`${cur.packages.length}개 고름`, `${cur.packages.length} selected`)}</span></h3>
                  <p className="set-desc tex-note">{t('고른 패키지는 setting.tex에 \\usepackage 줄로 들어갑니다.', 'Selected packages go into setting.tex as \\usepackage lines.')}</p>
                  <div className="pick-list tex-packages">
                    {packages.map((p) => (
                      <label key={p.name} className={`pick-row tex-pkg${cur.packages.includes(p.name) ? '' : ' off'}`} data-ui="패키지 줄">
                        <input type="checkbox" checked={cur.packages.includes(p.name)} onChange={(e) => save(cur.id, cur.name, { packages: e.target.checked ? [...cur.packages, p.name] : cur.packages.filter((n) => n !== p.name) })} />
                        <code>{p.name}</code>
                        <span className="muted">{p.desc}</span>
                      </label>
                    ))}
                  </div>
                  <div className="tex-form">
                    <TextField ui="setting.tex에 더할 줄 (직접 정의한 기호 등)" label={t('setting.tex에 더할 줄 (직접 정의한 기호 등)', 'Extra lines for setting.tex (your own symbols, etc.)')} value={cur.settingExtra} rows={4} placeholder={'\\newcommand{\\Tr}{\\operatorname{Tr}}'} onSave={(v) => save(cur.id, cur.name, { settingExtra: v })} />
                  </div>
                </div>

                <div data-ui="내보낼 파일">
                  <h3 className="tpl-h">{t('내보낼 때 생기는 파일', 'Files created on export')}</h3>
                  <div className="tex-files">
                    <TexFile name="main.tex" template={cur.id} text={previews[cur.id]?.main ?? ''} />
                    <TexFile name="setting.tex" template={cur.id} text={previews[cur.id]?.setting ?? ''} />
                  </div>
                  {!!cur.files?.length && (
                    <div className="tex-extra" data-ui="스타일 파일">
                      <p className="set-desc tex-note">{t('이 서식은 아래 파일을 main.tex 옆에 함께 두어야 합니다 (내보내기와 컴파일은 앱이 알아서 둡니다). XeLaTeX로 컴파일합니다.', 'This template needs the files below next to main.tex (export and compile place them for you). Compiles with XeLaTeX.')}</p>
                      {cur.files.map((f) => (
                        <div className="tex-file-head" key={f}>
                          <code>{f}</code><span className="sp" />
                          <a className="btn" href={latexApi.downloadUrl(f, cur.id)} download={f}>{t('받기', 'Download')}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            <LatexMacros onSaved={onSaved} />
          </div>
        </div>
      </section>
    </main>
  )
}

/** \documentclass[…]{revtex4-1} → revtex4-1 */
const classOf = (x: LatexTemplate) => /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(x.documentClass)?.[1]?.trim() || t('기타', 'Other')

/**
 * 서식 카드의 미리보기: 서버가 예문을 그 서식으로 컴파일한 PDF의 첫 쪽을 그린다.
 * version이 바뀌면(서식을 고치면) 다시 받는다. 컴파일하지 못하면 이유 한 줄.
 */
function TemplateThumb({ id, version }: { id: string; version: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | string>('loading')
  useEffect(() => {
    let dead = false
    setState('loading')
    void (async () => {
      try {
        const res = await fetch(latexApi.previewUrl(id, version))
        // 만들지 못하면 서버가 PDF 대신 { error }를 보낸다
        if (!res.ok || !res.headers.get('content-type')?.includes('pdf')) { const b = await res.json().catch(() => ({})) as { error?: string }; throw new Error(b.error ?? t(`미리보기를 만들지 못했습니다 (${res.status})`, `Could not make the preview (${res.status})`)) }
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise
        const page = await doc.getPage(1)
        const c = canvas.current
        if (dead || !c) return
        const base = page.getViewport({ scale: 1 })
        const scale = (c.parentElement?.clientWidth ?? 200) * (window.devicePixelRatio || 1) / base.width
        const vp = page.getViewport({ scale })
        c.width = Math.round(vp.width); c.height = Math.round(vp.height)
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise
        if (!dead) setState('ok')
        void doc.destroy()
      } catch (e) { if (!dead) setState((e as Error).message || t('미리보기를 만들지 못했습니다', 'Could not make the preview')) }
    })()
    return () => { dead = true }
  }, [id, version])
  return (
    <span className="tpl-thumb" data-ui="서식 미리보기">
      <canvas ref={canvas} className={state === 'ok' ? '' : 'hidden'} aria-label={t('첫 쪽 미리보기', 'First page preview')} />
      {state === 'loading' && <span className="muted tpl-thumb-note">{t('미리보기를 만드는 중…', 'Making the preview…')}</span>}
      {state !== 'ok' && state !== 'loading' && <span className="muted tpl-thumb-note">{state}</span>}
    </span>
  )
}

/** 입력칸: 칸을 떠날 때 바뀌었으면 저장한다 */
function TextField({ ui, label, value, line, plain, rows, placeholder, onSave }: { /** 피드백 부위 이름 (한국어 그대로) */ ui: string; label: string; value: string; line?: boolean; plain?: boolean; rows?: number; placeholder?: string; onSave(v: string): void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => { if (draft !== value) onSave(draft) }
  return (
    <label className="field" data-ui={ui}>
      <span>{label}</span>
      {line
        ? <input className={plain ? undefined : 'tex-code'} value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        : <textarea className="tex-code" rows={rows} value={draft} spellCheck={false} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />}
    </label>
  )
}

function TexFile({ name, template, text }: { name: string; template: string; text: string }) {
  return (
    <div className="tex-file" data-ui={name}>
      <div className="tex-file-head">
        <code>{name}</code><span className="sp" />
        <button className="btn" onClick={() => void navigator.clipboard?.writeText(text)}>{t('복사', 'Copy')}</button>
        <a className="btn" href={latexApi.downloadUrl(name, template)} download={name}>{t('받기', 'Download')}</a>
      </div>
      <pre className="tex-pre">{text}</pre>
    </div>
  )
}
