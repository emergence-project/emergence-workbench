// 프로젝트를 목록에서 제거 (11/9 친구 피드백 17:13 "프로젝트 삭제"):
// 프로젝트 정보 아래 칸에서 제목을 적고 제거한다. 폴더 · GitHub 저장소는 그대로 두고,
// 알림의 「되돌리기」가 설정(성격 · 분야 · 색 · 순서)째 되돌린다.
import { useEffect, useRef, useState } from 'react'
import { Dialog } from './dialogs'
import { api } from './api'
import { flash } from './flash'
import { go, type Route } from './router'
import { t } from './i18n'

interface Removed { id: string; title: string }
/** App의 useProjectRemove가 건 처리 (하나뿐) */
let handle: ((r: Removed) => void) | null = null

/** 어디서든 부른다. App의 useProjectRemove가 받아 목록을 다시 읽는다 */
export function removeProject(r: Removed): void {
  handle?.(r)
}

/** App에 한 번: 제거 · 되돌리기 뒤 프로젝트 목록을 다시 읽고, 지금 연 프로젝트였으면 홈으로 간다 */
export function useProjectRemove(reload: () => Promise<unknown>, route: Route): void {
  const open = useRef<string | undefined>(undefined)
  open.current = 'rid' in route ? route.rid : undefined
  useEffect(() => {
    const run = ({ id, title }: Removed) => {
      api.removeProject(id).then(async () => {
        if (open.current === id) go({ page: 'home' })
        await reload()
        flash(t(`「${title}」을(를) 목록에서 제거했습니다. 폴더는 그대로입니다`, `Removed "${title}" from the list. The folder stays`), {
          label: t('되돌리기', 'Undo'),
          run: () => { api.restoreProject(id).then(() => reload()).then(() => flash(t(`「${title}」을(를) 되돌렸습니다`, `Restored "${title}"`)), (e: Error) => flash(e.message)) },
        })
      }, (e: Error) => flash(e.message))
    }
    handle = run
    return () => { if (handle === run) handle = null }
  }, [reload])
}

/**
 * 프로젝트 정보 아래 「목록에서 제거」 칸 (11/9 사용자: 제거는 프로젝트 설정 같은 쪽에서, GitHub처럼 제목을 한 번 적는 안전장치).
 * 창에서 제목을 그대로 적어야 제거 버튼이 켜진다. 폴더 · 파일 · GitHub 저장소는 그대로다.
 */
export function ProjectRemoveSection({ id, title }: Removed) {
  const [open, setOpen] = useState(false)
  return (
    <section className="info-sec" data-ui="목록에서 제거 칸">
      <h2>{t('목록에서 제거', 'Remove from list')}</h2>
      <div className="info-remove">
        <p>{t('이 컴퓨터의 프로젝트 목록에서만 뺍니다. 폴더 · 파일 · GitHub 저장소는 그대로입니다.', 'Takes the project off this computer\'s list only. The folder, files and GitHub repository stay.')}</p>
        <button className="btn danger" data-ui="목록에서 제거 버튼" onClick={() => setOpen(true)}>{t('목록에서 제거', 'Remove from list')}</button>
      </div>
      {open && <RemoveDialog id={id} title={title} onClose={() => setOpen(false)} />}
    </section>
  )
}

function RemoveDialog({ id, title, onClose }: Removed & { onClose(): void }) {
  const [typed, setTyped] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const ok = typed.trim() === title.trim()
  const run = () => { if (ok) { onClose(); removeProject({ id, title }) } }
  return (
    <Dialog ui="목록에서 제거" title={t(`「${title}」을(를) 목록에서 제거`, `Remove "${title}" from the list`)} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn danger" disabled={!ok} onClick={run}>{t('제거', 'Remove')}</button>
    </>}>
      <p className="ask-hint">{t('폴더 · 파일 · GitHub 저장소는 그대로 남습니다. 다시 넣으려면 홈에서 「프로젝트 등록」으로 같은 폴더를 고릅니다.', 'The folder, files and GitHub repository stay. To add it back, pick the same folder with "Register project" on the home page.')}</p>
      <label className="field"><span>{t('확인하려면 프로젝트 제목을 그대로 적으세요', 'Type the project title to confirm')}</span>
        <input ref={input} value={typed} placeholder={title} spellCheck={false} data-ui="제목 확인 입력란"
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) run() }} />
      </label>
    </Dialog>
  )
}
