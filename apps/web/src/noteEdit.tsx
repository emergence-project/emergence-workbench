import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAutosave, type AutosaveOptions } from './autosave'
import type { EditView } from './NoteToolbar'
import { store } from './store'
import { t } from './i18n'

const VIEW_KEY = 'rw.notes.editView'

/**
 * 노트 화면의 고치기 흐름 (노트 화면 틀 2단계): 읽기/고치기, 보기, 이름 초안, 저장 시각, 알림,
 * 저장 상태 옆 행동(충돌이면 "파일 다시 읽기", 실패면 "다시 저장"), "편집 완료".
 * 저장 자체는 저장기(autosave.ts)가 맡고, 노트 종류는 불러오기·바깥 변경·편집 완료 뒤 할 일만 채운다.
 */
export function useNoteEdit(key: string, { write, onState, onSaved, mtime, blocked }: Pick<AutosaveOptions, 'write' | 'onState' | 'onSaved'> & {
  /** 파일의 마지막 고친 때 (저장 시각을 이보다 앞으로 보이지 않는다) */
  mtime?: number
  /** 지금은 저장하지 않는다 (지우는 중 등) */
  blocked?(): boolean
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { saver, state } = useAutosave(key, {
    write: async (text, hash) => { const next = await write(text, hash); setSavedAt(Date.now()); return next },
    onState, onSaved,
    onError: (e) => setNotice(e.message),
  })
  const [editing, setEditing] = useState(false)
  const [view, setViewState] = useState<EditView>(() => store.get<EditView>(VIEW_KEY, 'live'))
  const setView = useCallback((v: EditView) => { setViewState(v); store.set(VIEW_KEY, v) }, [])
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  useEffect(() => { if (mtime) setSavedAt((at) => Math.max(at ?? 0, mtime)) }, [mtime])
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked
  const saveNow = useCallback(async () => (blockedRef.current?.() ? false : saver.flush()), [saver])

  /** 연필: 이름을 글 칸으로 열고, 본문 편집기를 여는 노트면 편집기도 연다 */
  const start = (title: string, openEditor = true) => { setTitleDraft(title); if (openEditor) setEditing(true) }
  /**
   * 편집 완료 (Esc): 저장을 마친 뒤에 닫는다. 저장하지 못했으면(충돌 포함) 닫지 않는다:
   * 닫으면 저장하지 않은 원문으로 돌아갈 길이 없다. 닫은 뒤 고친 이름을 받아 할 일을 한다.
   */
  const finish = async (after?: (title: string | null) => unknown): Promise<boolean> => {
    if (saver.state !== 'saved' && !(await saveNow())) return false
    const draft = titleDraft
    setTitleDraft(null)
    setEditing(false)
    await after?.(draft)
    return true
  }

  /** 툴바의 저장 상태 옆 행동 */
  const saveAction = (reload: () => void): ReactNode => state === 'conflict'
    ? <button className="btn sm" title={t('이 화면에서 저장하지 않은 고침을 버리고 파일을 다시 읽습니다', 'Discard unsaved edits on this screen and reload the file')} onClick={reload}>{t('파일 다시 읽기', 'Reload file')}</button>
    : state === 'error' ? <button className="btn sm" onClick={() => void saveNow()}>{t('다시 저장', 'Save again')}</button> : undefined

  return { saver, state, editing, setEditing, view, setView, titleDraft, setTitleDraft, savedAt, notice, setNotice, saveNow, start, finish, saveAction }
}
