import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useEffect, useState } from 'react'
import { latexApi, type LatexMacrosView } from './api'
import { forgetConceptMacros } from './ConceptNotes'
import { Icon } from './icons'
import { t, plural } from './i18n'

/**
 * 설정 › LaTeX › 명령어 (10/4 19:30 "커스텀 기호나 명령어를 만드는 것도", 22:02 "기호보다 command 목록으로"): 모든 노트가 함께 쓰는 명령어 목록.
 * 파일은 research-library의 concepts/macros.tex 하나이고, 개념노트 화면(KaTeX)과 연구노트 컴파일·내보내기가 함께 쓴다.
 * 한 연구에만 쓰는 명령어는 그 연구의 workbench/macros.tex에 두고, 같은 이름이면 그쪽이 앞선다.
 */
export function LatexMacros({ onSaved }: { onSaved(message: string): void }) {
  const [view, setView] = useState<LatexMacrosView | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => { latexApi.macros().then(setView).catch((e: Error) => setError(e.message)) }, [])

  const save = async () => {
    if (draft === null || !view) return
    try {
      const v = await latexApi.saveMacros(draft, view.hash)
      setView(v)
      setDraft(null)
      forgetConceptMacros()
      onSaved(t(`명령어를 저장했습니다 — ${Object.keys(v.macros).length}개`, `Saved macros: ${plural(Object.keys(v.macros).length, 'macro')}`))
    } catch (e) { onSaved(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Could not save: ${(e as Error).message}`)) }
  }
  const list = Object.entries(view?.macros ?? {})

  return (
    <section id="latex-macros" data-ui="공통 기호">
      <div className="sec-head">
        <h2>{t('명령어', 'Macros')}</h2>{view && <span className="count">{t(`${list.length}개`, `${list.length}`)}</span>}<span className="sp" />
        {view?.library && draft === null && <button className="icon-btn" data-ui="기호 고치기" title={t('고치기 — 명령어 파일을 고칩니다', 'Edit the macros file')} aria-label={t('고치기', 'Edit')} onClick={() => setDraft(view.text)}>{Icon.pencil}</button>}
      </div>
      <p className="set-desc tex-note">{t('모든 노트가 함께 쓰는 LaTeX 명령어(\\newcommand)입니다. 개념노트 화면과 LaTeX 컴파일·내보내기가 같은 목록을 씁니다. 한 연구에만 쓰는 명령어는 그 연구의 ', 'LaTeX macros (\\newcommand) shared by all notes. Concept notes and LaTeX compile and export use the same list. Put macros for one project only in that project\'s ')}<code>workbench/macros.tex</code>{t('에 두면 되고, 이름이 같으면 그쪽이 앞섭니다.', '. If a name matches, that one wins.')}</p>
      {!view && <p className="muted">{error || t('불러오는 중…', 'Loading…')}</p>}
      {view && !view.library && <p className="muted">{t('개념노트 라이브러리(research-library)를 정하면 여기서 명령어를 고칠 수 있습니다.', 'Set the concept note library (research-library) to edit macros here.')}</p>}
      {view?.library && draft !== null && (
        <div className="mac-edit" data-ui="기호 파일">
          <div className="tex-file-head"><code>research-library/{view.file}</code></div>
          <textarea className="tex-code" rows={Math.min(24, Math.max(8, draft.split('\n').length + 1))} value={draft} spellCheck={false} autoFocus
            placeholder={'\\newcommand{\\abs}[1]{\\left|#1\\right|}\n\\DeclareMathOperator{\\col}{col}'}
            onChange={(e) => setDraft(e.target.value)} />
          <div className="mac-actions">
            <button className="btn primary" disabled={draft === view.text} onClick={() => void save()}>{t('저장', 'Save')}</button>
            <button className="btn" onClick={() => setDraft(null)}>{t('취소', 'Cancel')}</button>
          </div>
        </div>
      )}
      {view?.library && draft === null && (list.length === 0
        ? <p className="muted">{t('아직 명령어가 없습니다. 연필을 눌러 ', 'No macros yet. Click the pencil to add ')}<code>\newcommand</code>{t('나 ', ' or ')}<code>\DeclareMathOperator</code>{t(' 줄을 더하세요.', ' lines.')}</p>
        : (
          <table className="mac-table" data-ui="기호 목록">
            <thead><tr><th>{t('명령어', 'Macro')}</th><th>{t('정의', 'Definition')}</th><th>{t('보기', 'Preview')}</th></tr></thead>
            <tbody>
              {list.map(([name, body]) => (
                <tr key={name}>
                  <td><code>{name}</code></td>
                  <td><code className="mac-body">{body}</code></td>
                  <td dangerouslySetInnerHTML={{ __html: katex.renderToString(example(name, body), { throwOnError: false, macros: { ...view.macros } }) }} />
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  )
}

/** 보기 줄: 인자 수만큼 a, b, c …를 넣어 그 명령어를 한 번 쓴다 */
function example(name: string, body: string): string {
  const n = Math.max(0, ...[...body.matchAll(/#(\d)/g)].map((m) => Number(m[1])))
  return name + Array.from({ length: n }, (_, i) => `{${'abcdefghi'[i]}}`).join('')
}
