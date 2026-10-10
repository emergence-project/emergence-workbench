import { useCallback, useEffect, useRef, useState } from 'react'
import { type ResearchApi, type ResearchSummary, type WorkbenchEvent } from './api'
import { Editor, type EditorHandle } from './Editor'
import { statusLabel, statusOf } from './format'
import { Icon } from './icons'
import { ProofMark, StatusDot } from './StatusDot'
import { isGiven, KIND_COLOR, KIND_LABEL, PROOF_TEXT, proofState, proofsOf, shortLabel, usedBy } from './notes'
import { NoteHead, NoteToolbar } from './NoteToolbar'
import { useRightMode } from './noteScreen'
import { go } from './router'
import { targetOfTab, useSlot } from './Comments'
import { openRecordComposer } from './RecordContext'
import { recordRevealRange, recordSelectionFromLines } from './recordHelpers'
import { onOutside, useAutosave } from './autosave'
import { t } from './i18n'

/**
 * 진술 노트: 저장소 statements/의 파일을 그 자리에서 읽고 고친다.
 * 위는 관계(사용·쓰이는 곳·증명 작업·출처), 아래는 LaTeX 원문. 저장은 블록과 같은 안전장치(바깥에서 바뀌었으면 덮어쓰지 않음).
 */
export function StatementTab({ rid, sid, rapi, summary, bus, onChanged }: {
  rid: string; sid: string; rapi: ResearchApi; summary: ResearchSummary; bus: EventTarget; onChanged(): void
}) {
  const s = summary.statements.find((x) => x.id === sid)
  const [loaded, setLoaded] = useState<{ content: string; file: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const rightMode = useRightMode()
  const editor = useRef<EditorHandle>(null)
  const { saver, state } = useAutosave(`${rid}/${sid}`, {
    write: (text, hash) => rapi.saveStatement(sid, text, hash),
    onSaved: () => onChanged(),
    onError: (e) => setNotice(e.message),
  })
  const recordTarget = targetOfTab({ k: 'statement', sid }, () => s?.title ?? sid)!
  const recordSlot = useSlot(rid, recordTarget.target)
  useEffect(() => {
    if (!recordSlot.reveal || !loaded) return
    const record = recordSlot.file?.comments.find((entry) => entry.id === recordSlot.reveal!.id)
    const range = record && recordRevealRange(saver.text, record)
    if (range) editor.current?.revealLines(saver.text.slice(0, range.from).split('\n').length, saver.text.slice(0, range.to).split('\n').length)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록 열기(nonce)가 바뀔 때만 그 자리로 간다
  }, [recordSlot.reveal?.nonce, loaded])

  const load = useCallback(async (msg?: string) => {
    const d = await rapi.readStatement(sid)
    saver.load(d.content, d.hash)
    if (loaded) editor.current?.replaceContent(d.content)
    else setLoaded({ content: d.content, file: d.file })
    if (msg) setNotice(msg)
  }, [rapi, sid, loaded, saver])
  useEffect(() => { load().catch((e: Error) => setNotice(e.message)) }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(() => saver.flush(), [saver])
  const onChange = useCallback((text: string) => saver.edit(text), [saver])

  // 에이전트가 진술 파일을 바꾸면: 고치던 중이 아니면 새로 읽고, 고치던 중이면 저장을 멈춘다
  useEffect(() => {
    const on = (ev: Event) => {
      const e = (ev as CustomEvent<WorkbenchEvent>).detail
      if (e.research !== rid || e.type !== 'statement' || e.id !== sid) return
      onOutside(saver, e.hash, { gone: () => setNotice(t('이 진술 파일이 지워졌습니다.', 'This statement file was deleted.')), reload: () => void load(t('바깥(에이전트나 다른 편집기)에서 바뀐 내용을 불러왔습니다.', 'Loaded changes made outside (by an agent or another editor).')) })
    }
    bus.addEventListener('rw', on)
    return () => bus.removeEventListener('rw', on)
  }, [bus, rid, sid, load, saver])

  if (!s) return <div className="ws-empty">{t('진술을 찾지 못했습니다: ', 'Statement not found: ')}{sid}</div>
  const p = proofState(summary, s)
  const byS = new Map(summary.statements.map((x) => [x.id, x]))
  const uses = s.uses.map((u) => byS.get(u)).filter((x): x is NonNullable<typeof x> => !!x)
  const users = usedBy(summary, s.id)
  const proofs = proofsOf(summary, s)
  const chip = (x: (typeof uses)[number]) => (
    <button key={x.id} className="dep-chip" onClick={() => go({ page: 'statement', rid, sid: x.id })} title={x.title}>{shortLabel(x)}</button>
  )

  return (
    <div className="ws-doc" data-ui="진술">
      <section className="pane">
        <div data-ui="머리줄">
          <NoteToolbar status={<span className="note-status"><ProofMark p={p} /><span className="g-name">{PROOF_TEXT[p]}</span></span>}
            save={state} saveUi="상태줄" editing={false} onComment={() => openRecordComposer(rid, recordTarget, recordSelectionFromLines(saver.text, editor.current?.selection() ?? null))} commentOn={rightMode === 'records'}
            saveAction={state === 'conflict'
              ? <button className="btn sm" onClick={() => void load(t('파일을 다시 읽었습니다. 이 화면에서 고친 내용은 버렸습니다.', 'Reloaded the file. Edits made on this screen were discarded.'))}>{t('파일 다시 읽기', 'Reload file')}</button>
              : state === 'error' ? <button className="btn sm" onClick={() => void save()}>{t('다시 저장', 'Save again')}</button> : undefined}
            menu={[
              { label: t('지도', 'Map'), tip: t('지도에서 이 진술의 이웃 보기', 'Show this statement\'s neighbors on the map'), onClick: () => go({ page: 'map', rid }) },
              { label: t('파일 다시 읽기', 'Reload file'), onClick: () => void load(t('파일을 다시 읽었습니다. 이 화면에서 고친 내용은 버렸습니다.', 'Reloaded the file. Edits made on this screen were discarded.')) },
            ]} />
        </div>
        {state === 'conflict' && (
          <div className="banner danger" data-ui="저장 충돌 안내">
            {t('다른 곳(에이전트나 다른 편집기)에서 이 파일이 바뀌어 저장을 멈췄습니다. 덮어쓰지 않았습니다.', 'This file changed elsewhere (an agent or another editor), so saving stopped. Nothing was overwritten.')}
          </div>
        )}
        {notice && <div className="banner" data-ui="알림">{notice}<span className="sp" /><button className="btn ghost" onClick={() => setNotice(null)}>{t('닫기', 'Close')}</button></div>}
        <div className="statement-head" data-ui="진술 머리">
          <NoteHead title={s.title ?? s.id} editing={false}>
            <span className="kind-chip" style={{ background: KIND_COLOR[s.kind] ?? KIND_COLOR.statement }}>{KIND_LABEL[s.kind] ?? s.kind}</span>
          </NoteHead>
          <dl className="statement-relations" data-ui="관계 표">
            {!isGiven(s) && <>
              <dt>{t('증명 작업', 'Proof work')}</dt>
              <dd>{proofs.length ? proofs.map((b) => (
                <button key={b.id} className="dep-chip" onClick={() => go({ page: 'block', rid, bid: b.id })}>
                  <StatusDot s={statusOf(b.status)} /> <span className="ico" aria-hidden>{Icon.block}</span> {b.title ?? b.id} · {statusLabel(statusOf(b.status))}
                </button>
              )) : <span className="muted">{t('없음', 'None')}</span>}</dd>
            </>}
            <dt>{t('기대는 것', 'Depends on')}</dt><dd>{uses.length ? uses.map(chip) : <span className="muted">{t('없음', 'None')}</span>}</dd>
            <dt>{t('쓰이는 곳', 'Used by')}</dt><dd>{users.length ? users.map(chip) : <span className="muted">{t('없음', 'None')}</span>}</dd>
            {s.source && <><dt>{t('출처', 'Source')}</dt><dd>{s.source}{s.page ? ` · p.${s.page}` : ''}</dd></>}
            <dt>{t('파일', 'File')}</dt><dd className="mono muted" title={s.file}>{s.file.split('/').pop() ?? s.file}</dd>
          </dl>
        </div>
        {loaded && <Editor key={sid} ref={editor} initial={loaded.content} errorLines={[]} onChange={onChange} onCursorLine={() => undefined} onSave={() => void save()} onCompile={() => void save()} />}
      </section>
    </div>
  )
}
