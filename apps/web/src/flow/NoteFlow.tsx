import { useState } from 'react'
import { ConflictError, flowApi, type FlowEvidence, type FlowNode, type NoteRow } from '../api'
import { t as tr } from '../i18n'
import { MarkIcon } from './marks'
import { useFlow } from './data'
import { openFlowDot } from './FlowChart'

/** 이 노트(같은 노트 폴더의 파일 포함)를 근거로 단 점인지 */
const citesNote = (n: FlowNode, file: string) => {
  const dir = (f: string) => f.replace(/\/[^/]*$/, '')
  const folder = /\/note\.(md|tex|yaml)$/.test(file) ? dir(file) : null
  return n.evidence.some((e) => e.file && (e.file === file || (folder && dir(e.file) === folder)))
}

/** 노트 정보 갈래의 "흐름": 이 노트를 근거로 단 점 (누르면 주제 화면의 흐름에서 그 점), 그리고 점에 근거로 잇기 */
export function NoteFlow({ rid, row, onSaved }: { rid: string; row: NoteRow; onSaved(m: string): void }) {
  const { scan, reload } = useFlow(rid)
  const all = scan?.nodes ?? null
  const [pick, setPick] = useState('')
  if (!all) return null
  const mine = all.filter((n) => citesNote(n, row.file))
  // 노트의 주제에 든 점을 먼저
  const rest = all.filter((n) => !mine.includes(n))
    .sort((a, b) => Number(!a.topics.some((x) => row.topics.includes(x))) - Number(!b.topics.some((x) => row.topics.includes(x))) || a.short.localeCompare(b.short))
  const kind: FlowEvidence['kind'] = row.kind === 'calc' ? 'calc' : row.kind === 'proof' ? 'proof' : 'other'
  const link = async (id: string) => {
    const n = all.find((x) => x.id === id)
    if (!n) return
    try {
      await flowApi(rid).patch(n.id, n.hash, { evidence: [...n.evidence.map((e) => ({ kind: e.kind, text: e.text, ...(e.title && { title: e.title }), ...(e.ref ? { ref: e.ref } : e.file ? { file: e.file } : {}) })), { kind, text: '', title: row.title, file: row.file }] })
      onSaved(tr(`점 "${n.short}"에 이 노트를 근거로 달았습니다`, `Attached this note to the dot "${n.short}" as evidence`))
    } catch (e) { onSaved(e instanceof ConflictError ? tr('그새 점 파일이 바뀌었습니다. 다시 해 주세요.', 'The dot file changed in the meantime. Try again.') : (e as Error).message) }
    setPick('')
    reload()
  }
  return <>
    {mine.length ? <ul className="rs-list">{mine.map((n) => <li key={n.id}>
      <button type="button" className="a fl-pill" title={`${n.title}\n${tr('흐름 화면에서 열기', 'Open in the flow')}`} onClick={() => openFlowDot(rid, n)}>
        <MarkIcon n={n} size={16} /><span>{n.short}</span></button>
    </li>)}</ul> : <p className="empty rs-empty">{tr('이 노트를 근거로 단 점이 없습니다', 'No dot uses this note as evidence')}</p>}
    {rest.length > 0 && <select className="rs-select rs-add" data-ui="노트 흐름 잇기" value={pick} aria-label={tr('점에 근거로 잇기', 'Attach to a dot as evidence')}
      onChange={(e) => { setPick(e.target.value); if (e.target.value) void link(e.target.value) }}>
      <option value="">{tr('＋ 점에 잇기…', '＋ Attach to a dot…')}</option>
      {rest.map((n) => <option key={n.id} value={n.id}>{n.short}</option>)}
    </select>}
  </>
}
