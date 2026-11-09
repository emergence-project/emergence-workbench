// 프로젝트를 목록에서 제거 (11/9 친구 피드백 17:13 "오른쪽 클릭으로 프로젝트 삭제"):
// 레일 · 홈 목록 · 홈 카드의 오른쪽 클릭 메뉴가 부른다. 폴더 · GitHub 저장소는 그대로 두고,
// 알림의 「되돌리기」가 설정(성격 · 분야 · 색 · 순서)째 되돌린다.
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { api } from './api'
import { flash } from './flash'
import { go, type Route } from './router'
import { useDismiss } from './useDismiss'
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

/** 프로젝트 오른쪽 클릭 메뉴: onMenu를 줄 · 버튼의 onContextMenu에 달고 menu를 그 화면 아무 곳에 둔다 */
export function useProjectMenu() {
  const [at, setAt] = useState<{ r: Removed; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(!!at, box, () => setAt(null))
  const onMenu = (r: Removed) => (e: MouseEvent) => {
    e.preventDefault()
    setAt({ r, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 60) })
  }
  const menu = at && (
    <div ref={box} className="menu at-pointer" role="menu" data-ui="프로젝트 메뉴" style={{ left: at.x, top: at.y }}>
      <button role="menuitem" className="danger" title={t('폴더와 GitHub 저장소는 그대로 둡니다', 'The folder and GitHub repository stay')}
        onClick={() => { const r = at.r; setAt(null); removeProject(r) }}>{t('목록에서 제거', 'Remove from list')}</button>
    </div>
  )
  return { onMenu, menu }
}
