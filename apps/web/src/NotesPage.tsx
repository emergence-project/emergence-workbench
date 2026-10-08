import { useState } from 'react'
import { api, type LibraryInfo, type LibraryNote, type ManuscriptInfo, type ResearchApi, type ResearchSummary } from './api'
import { AUX_NOTE, KIND_COLOR, KIND_LABEL, paperOrder, proofState, shortLabel } from './notes'
import { NewNote } from './NewNote'
import { ExportPicker } from './NoteExport'
import { MainNotePicker } from './OverviewPage'
import { go } from './router'
import { PaperCards } from './Topics'
import { askText } from './askText'
import { Icon } from './icons'
import { ProofMark } from './StatusDot'
import { plural, t } from './i18n'

/** 노트의 네 덩이 중 페이지가 있는 셋. 넷째(지도)는 MapPage */
export type NotesSection = 'notes' | 'concepts' | 'papers'

/**
 * 목록 화면 셋 (2026-10-03 코멘트, 10/5 4단계에서 notes를 원고 화면으로).
 * - 원고(notes): 원고 카드와 원고 정하기, 여러 노트 내보내기, 진술
 * - 개념노트(concepts): 이 프로젝트가 기대는 개념노트, 연결·새로 만들기
 * - 문헌노트(papers): 이 프로젝트 bib에 있는 논문의 문헌노트
 */
export function NotesPage({ show, rid, rapi, summary, manuscripts, library, onChanged, onLibraryChanged, onNewBlock, onSaved }: {
  show: NotesSection
  rid: string
  rapi: ResearchApi
  summary: ResearchSummary
  manuscripts: ManuscriptInfo[]
  library: LibraryInfo | null
  onChanged(): void
  onLibraryChanged(): void
  onNewBlock(): void
  onSaved(message: string): void
}) {
  return (
    <div className="ws-doc" data-ui="노트 화면">
      <section className="pane" data-ui="본문">
        <div className="scroll">
          <div className="page-body notes-page">
            {show === 'notes' && <ResearchNotes rid={rid} rapi={rapi} summary={summary} manuscripts={manuscripts} onChanged={onChanged} onNewBlock={onNewBlock} onSaved={onSaved} />}
            {show === 'concepts' && <LibraryNotes kind="concept" rid={rid} library={library} onLibraryChanged={onLibraryChanged} onSaved={onSaved} />}
            {show === 'papers' && <LibraryNotes kind="paper" rid={rid} library={library} onLibraryChanged={onLibraryChanged} onSaved={onSaved} />}
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * 원고 화면 (#/r/<rid>/notes, 왼쪽 사이드바 "원고"): 원고 카드 · 원고 정하기 · 여러 노트 내보내기 · 진술.
 * 10/5 "주제와 노트" 4단계: 예전 "연구노트" 화면의 카드(주제 · 연구노트 · 장 밖의 보조 노트)는 주제 화면과 "노트들"로,
 * 지운 노트는 프로젝트 첫 화면 노트 섹션 아래로 옮겼다. 원고 기능은 여기 그대로 둔다.
 */
function ResearchNotes({ rid, rapi, summary, manuscripts, onChanged, onNewBlock, onSaved }: {
  rid: string; rapi: ResearchApi; summary: ResearchSummary; manuscripts: ManuscriptInfo[]; onChanged(): void; onNewBlock(): void; onSaved(message: string): void
}) {
  const { statements } = summary
  /** 새 노트 칸: null이면 닫힘, 문자열이면 그 원고를 복사해서 */
  const [newFrom, setNewFrom] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const papers = manuscripts.filter((m) => m.kind === 'paper')
  return (
    <>
      <header className="notes-head">
        <h1 className="h-title">{t('원고', 'Manuscript')}</h1>
        <div className="topic-tools">
          <button className="btn" data-ui="노트 관계도 버튼" onClick={() => go({ page: 'map', rid })}>{t('지도 보기', 'View map')}</button>
          {manuscripts.length > 0 && <button className={`btn${exporting ? ' on' : ''}`} data-ui="노트 골라 내보내기 버튼" onClick={() => setExporting((v) => !v)}>{t('내보내기', 'Export')}</button>}
          <button className="btn" data-ui="새 보조 노트" onClick={onNewBlock}>＋ {t(`${AUX_NOTE} 만들기`, `New ${AUX_NOTE.toLowerCase()}`)}</button>
        </div>
      </header>
      {manuscripts.some((m) => m.needsBodyOnly) && (
        // 10/4 15:41·15:56 피드백: 머리와 제목·저자는 노트에 두지 않고 프로젝트 서식으로 컴파일한다
        <div className="banner" data-ui="모두 본문만 남기기 안내">{t(`머리(문서 종류·패키지 줄)나 제목·저자 줄이 남은 노트가 ${manuscripts.filter((m) => m.needsBodyOnly).length}개 있습니다. 컴파일할 때 프로젝트 서식과 저자 정보가 붙으니 노트에는 본문만 둡니다.`,
          `${plural(manuscripts.filter((m) => m.needsBodyOnly).length, 'note still has', 'notes still have')} a preamble (document class, packages) or title and author lines. Compiling adds the project template and author info, so notes keep only the body.`)}
          <span className="sp" /><button className="btn" data-ui="모두 본문만 남기기" onClick={() => {
            rapi.makeAllBodyOnly().then((r) => { onSaved(t(`노트 ${r.notes}개를 본문만 남겼습니다${r.template ? ` (프로젝트 서식: ${r.template})` : ''}`, `Kept only the body in ${plural(r.notes, 'note')}${r.template ? ` (project template: ${r.template})` : ''}`)); onChanged() }).catch((e: Error) => onSaved(e.message))
          }}>{t('모두 본문만 남기기', 'Keep only the body in all')}</button></div>
      )}
      {exporting && <ExportPicker rid={rid} manuscripts={manuscripts} onClose={() => setExporting(false)} />}

      <section className="notes-sec" data-ui="원고 목록">
        {papers.length > 0 && <PaperCards rid={rid} manuscripts={papers} onCopy={(key) => setNewFrom(key)} onAdd={() => setPicking(true)}
          onRemove={(ms) => rapi.unsetMainNote(ms.main).then(() => { onChanged(); onSaved(t(`"${ms.name}"을 목록에서 뺐습니다. 파일 ${ms.main}은 그대로이고, 카드 줄 끝의 "＋ 원고 더하기"로 다시 넣을 수 있습니다`, `Removed "${ms.name}" from the list. The file ${ms.main} stays, and "＋ Add manuscript" at the end of the card row puts it back`)) }).catch((e: Error) => onSaved(e.message))} />}
        {newFrom !== null && <NewNote key={newFrom} rid={rid} rapi={rapi} manuscripts={manuscripts} from={newFrom} onChanged={onChanged} onSaved={onSaved} onClose={() => setNewFrom(null)} />}
        <MainNotePicker rapi={rapi} more={papers.length > 0} open={picking} onClose={() => setPicking(false)} onDone={() => { setPicking(false); onSaved(t('원고를 정했습니다 — research.yaml에 적었습니다', 'Set the manuscript in research.yaml')); onChanged() }} />
      </section>

      {statements.length > 0 && (
        <section className="notes-sec" data-ui="진술 목록">
          <h2>{t('진술', 'Statements')} <span className="muted">{statements.length}</span></h2>
          <ul className="notes-list">{paperOrder(statements).map((x) => (
            <li key={x.id}><button className="notes-row" data-ui="진술 항목" onClick={() => go({ page: 'statement', rid, sid: x.id })}>
              <span className="notes-proof"><ProofMark p={proofState(summary, x)} /></span>
              <span className="notes-kind" style={{ color: KIND_COLOR[x.kind] ?? KIND_COLOR.statement }}>{KIND_LABEL[x.kind] ?? x.kind}</span><span className="t">{shortLabel(x)} · {x.title}</span>
            </button></li>
          ))}</ul>
        </section>
      )}
    </>
  )
}

/** 개념노트·문헌노트 페이지: 이 프로젝트가 쓰는 공유 라이브러리 노트 */
function LibraryNotes({ kind, rid, library, onLibraryChanged, onSaved }: {
  kind: 'concept' | 'paper'; rid: string; library: LibraryInfo | null; onLibraryChanged(): void; onSaved(message: string): void
}) {
  const used = (n: LibraryNote) => (library?.usedBy[`${n.kind}:${n.id}`] ?? []).some((u) => u.rid === rid)
  const list = (library?.notes ?? []).filter((n) => n.kind === kind && used(n))
  const titleKo = kind === 'concept' ? '개념노트' : '문헌노트'
  const title = kind === 'concept' ? t('개념노트', 'Concept notes') : t('문헌노트', 'Literature notes')
  const link = (id: string, name: string) =>
    api.linkConcept(rid, id, true).then(() => { onLibraryChanged(); onSaved(t(`개념노트 "${name}"를 이 프로젝트에 연결했습니다`, `Linked concept note "${name}" to this project`)) }).catch((e: Error) => onSaved(e.message))
  return (
    <>
      <header className="notes-head">
        <h1 className="h-title">{title}</h1>
        {kind === 'concept' && library?.path && (
          <select className="mini-select" value="" aria-label={t('개념노트 연결', 'Link concept note')} data-ui="개념노트 연결" onChange={(e) => {
            const id = e.target.value
            if (!id) return
            if (id === '+new') {
              void askText({ title: t('새 개념노트', 'New concept note'), label: t('제목', 'Title'), placeholder: t('예: Euler characteristic', 'e.g. Euler characteristic'), ok: t('만들기', 'Create') }).then((name) => {
                if (name?.trim()) api.createConcept({ title: name }).then((c) => link(c.id, name.trim())).catch((err: Error) => onSaved(err.message))
              })
              return
            }
            void link(id, library.notes.find((n) => n.id === id)?.title ?? id)
          }}>
            <option value="">＋ {t('개념노트 연결…', 'Link concept note…')}</option>
            {library.notes.filter((n) => n.kind === 'concept' && !used(n)).map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            <option value="+new">{t('새 개념노트 만들기…', 'New concept note…')}</option>
          </select>
        )}
      </header>
      <p className="muted">{kind === 'concept'
        ? t('여러 연구가 함께 쓰는 개념의 정의와 성질 (공유 라이브러리). 이 프로젝트나 그 노트가 기대는 것만 보입니다.', 'Definitions and properties of concepts shared across projects (shared library). Only those this project or its notes rely on are shown.')
        : t('논문을 읽고 정리한 노트 (공유 라이브러리). 이 프로젝트 bib에 있는 논문만 보입니다. 참고 자료의 논문에서 "문헌노트"로 만듭니다.', 'Notes written while reading papers (shared library). Only papers in this project\'s bib are shown. Create one from a paper in the materials with "Literature note".')}</p>
      <section className="notes-sec" data-ui={`${titleKo} 목록`}>
        {list.length === 0 ? <p className="muted">{kind === 'concept' ? t('아직 연결한 개념노트가 없습니다. 위에서 골라 연결합니다.', 'No concept notes linked yet. Pick one above to link it.') : t('아직 없습니다.', 'None yet.')}</p> : (
          <ul className="notes-list">{list.map((n) => (
            <li key={n.id}><button className="notes-row" data-ui={`${titleKo} 항목`} onClick={() => go({ page: n.kind, rid, id: n.id })}>
              <span className="lib-mark ico" aria-hidden>{kind === 'concept' ? Icon.concept : Icon.paper}</span><span className="t">{n.title}</span>
              {n.status !== 'reviewed' && <span className="muted">{n.empty ? t('빈 노트', 'Empty') : t('초안', 'Draft')}</span>}
            </button></li>
          ))}</ul>
        )}
      </section>
    </>
  )
}
