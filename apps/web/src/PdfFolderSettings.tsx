import { useEffect, useState } from 'react'
import { papersApi, type PaperFolder } from './api'
import { Icon } from './icons'
import { PAPERS_CHANGED } from './PapersPage'
import { t } from './i18n'

const CLOUD_LABEL = { icloud: 'iCloud', drive: 'Google Drive', local: t('이 맥', 'This Mac') } as const

/** 설정 › 라이브러리 관리 › 논문. 더한 논문의 PDF는 첫 폴더에 받는다. */
export function PdfFolderSettings({ onSaved, onReady }: { onSaved(m: string): void; onReady?(): void }) {
  const [folders, setFolders] = useState<PaperFolder[] | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { papersApi.folders().then((v) => setFolders(v.folders)).catch((e: Error) => setErr(e.message)) }, [])
  useEffect(() => { if (folders || err) onReady?.() }, [folders, err, onReady])
  const save = async (next: string[], msg: string) => {
    setBusy(true)
    try { setFolders((await papersApi.setFolders(next)).folders); setErr(''); window.dispatchEvent(new Event(PAPERS_CHANGED)); onSaved(msg); return true } catch (e) { setErr((e as Error).message); return false } finally { setBusy(false) }
  }
  const list = folders ?? []
  return (
    <div className="pl-folders">
      <p className="set-desc" title={t("iCloud Drive나 Google Drive 폴더도 됩니다. 클라우드에만 있는 PDF는 '클라우드'로 보이고, 열 때 맥이 받아 옵니다. arXiv에서 더한 논문의 PDF는 첫 폴더에 받습니다.", "iCloud Drive and Google Drive folders work too. PDFs that are only in the cloud show as 'cloud' and the Mac downloads them when opened. PDFs of papers added from arXiv go to the first folder.")}>{t('논문 PDF를 ', 'Folders where paper PDFs are found by the name ')}<code>&lt;{t('bib 키', 'bib key')}&gt;.pdf</code>{t(' 이름으로 찾는 폴더입니다.', '.')}</p>
      {list.length > 0 && <div className="set-rows">
        {list.map((f, i) => (
          <div key={f.path} className="set-row pl-folder" data-ui="PDF 폴더 줄" data-ui-item={f.path}>
            <span className="mono" title={f.path}>{f.path.split('/').filter(Boolean).pop() || f.path}</span>
            <span className="muted">{CLOUD_LABEL[f.cloud]}</span>
            {i === 0 && <span className="tag">{t('받는 곳', 'Downloads here')}</span>}
            {!f.exists && <span className="muted">{t('(이 맥에 없음)', '(not on this Mac)')}</span>}
            <span className="sp" />
            <button className="icon-btn" aria-label={t('빼기', 'Remove')} data-tip={t('빼기', 'Remove')} disabled={busy} onClick={() => void save(list.filter((x) => x.path !== f.path).map((x) => x.path), t('PDF 폴더를 뺐습니다 (폴더와 PDF는 그대로 있습니다)', 'Removed the PDF folder (the folder and its PDFs stay as they are)'))}>{Icon.x}</button>
          </div>
        ))}
      </div>}
      {!folders && !err && <p className="set-desc">{t('폴더를 읽는 중…', 'Reading folders…')}</p>}
      {folders && list.length === 0 && <p className="set-desc">{t('폴더가 없습니다. 아래에서 더해 주세요.', 'No folders yet. Add one below.')}</p>}
      <div className="pl-folder-add">
        <input value={text} disabled={!folders || busy} placeholder="/Users/…/Library/Mobile Documents/com~apple~CloudDocs/Papers" aria-label={t('더할 폴더 경로', 'Folder path to add')} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && folders && !busy && text.trim()) void save([...list.map((x) => x.path), text.trim()], t('PDF 폴더를 더했습니다', 'Added the PDF folder')).then((ok) => ok && setText('')) }} />
        <button className="btn" disabled={!folders || busy || !text.trim()} onClick={() => void save([...list.map((x) => x.path), text.trim()], t('PDF 폴더를 더했습니다', 'Added the PDF folder')).then((ok) => ok && setText(''))}>＋ {t('더하기', 'Add')}</button>
      </div>
      {err && <div className="banner danger">{err}</div>}
    </div>
  )
}
