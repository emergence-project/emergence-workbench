import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { setupApi, type ProjectState, type SetupView } from './api'
import { Icon } from './icons'
import { t } from './i18n'
import { PROJECT_STATE_DOT, PROJECT_STATE_LABEL } from './projectProfile'
import { qk } from './queries'
import { go } from './router'
import { StatusDot } from './StatusDot'

type Item = SetupView['elsewhere'][number]

/**
 * 다른 컴퓨터의 프로젝트 (10/21 사용자 "새 컴퓨터에 원래 프로젝트가 나와야, 최소한 받을지 물어야" → 결정 "목록을 보이고 묻기").
 * 개인 저장소에 올린 다른 컴퓨터의 목록 중 이 컴퓨터에 없는 것. 프로젝트마다 받기(이미 받을 곳에 있으면 등록), 모두 받기.
 * 설정 › 계정 › 시작 준비에 늘, 홈에는 카드로(닫으면 목록이 바뀔 때까지 숨김).
 */
export function useElsewhere() {
  const client = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fetchOne = async (p: Item) => {
    if (!p.remote) return
    const v = await setupApi.fetchProject({ remote: p.remote, folder: p.folder, tags: p.tags })
    client.setQueryData(qk.setup, v)
    void client.invalidateQueries({ queryKey: qk.researches })
  }
  const run = async (key: string, items: Item[]) => {
    setBusy(key); setError('')
    try { for (const p of items) await fetchOne(p) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  return { busy, error, fetch: (p: Item) => run(p.folder, [p]), fetchAll: (items: Item[]) => run('*', items.filter((p) => p.remote)) }
}

function ProjectRow({ p, busy, onFetch }: { p: Item; busy: string | null; onFetch(): void }) {
  const state = p.state as ProjectState | undefined
  return (
    <div className="setup-row elsewhere-row">
      {state && PROJECT_STATE_DOT[state] ? <StatusDot s={PROJECT_STATE_DOT[state]} /> : <span />}
      <div className="setup-main">
        <div className="set-name">{p.title}{state && PROJECT_STATE_LABEL[state] && <small className="setup-sub">{PROJECT_STATE_LABEL[state]}</small>}</div>
        <div className="setup-desc">{p.local ? t(`이 컴퓨터에 이미 있음: ${p.local}`, `Already on this computer: ${p.local}`) : p.remote ?? t('GitHub 주소 없음', 'No GitHub address')}</div>
      </div>
      {p.remote && <div className="setup-act">
        <button className="btn" disabled={!!busy} onClick={onFetch}>{busy === p.folder ? t('받는 중…', 'Downloading…') : p.local ? t('등록', 'Register') : t('받기', 'Download')}</button>
      </div>}
    </div>
  )
}

/** 설정 › 계정 › 시작 준비의 절 */
export function ElsewhereSection({ setup }: { setup?: SetupView }) {
  const { busy, error, fetch, fetchAll } = useElsewhere()
  const items = setup?.elsewhere ?? []
  if (!items.length) return null
  const machines = [...new Set(items.map((p) => p.machine))].join(' · ')
  return (
    <>
      <div className="sec-head elsewhere-head">
        <h3 className="set-h3">{t('다른 컴퓨터의 프로젝트', 'Projects on your other computers')} <small className="setup-sub">{machines}</small></h3>
        <button className="btn primary" disabled={!!busy} onClick={() => void fetchAll(items)}>{busy === '*' ? t('받는 중…', 'Downloading…') : t(`모두 받기 (${items.length})`, `Download all (${items.length})`)}</button>
      </div>
      <p className="setup-desc elsewhere-note">{t(`개인 저장소에 올라온 목록 중 이 컴퓨터에 없는 것입니다. 받을 곳: ${setup!.cloneDir}`, `Projects listed in your personal repository that are not on this computer. Downloaded to ${setup!.cloneDir}`)}</p>
      <div className="set-rows" data-ui="다른 컴퓨터의 프로젝트">
        {items.map((p) => <ProjectRow key={p.folder} p={p} busy={busy} onFetch={() => void fetch(p)} />)}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </>
  )
}

const HIDE_KEY = 'rw.elsewhere.hidden'
const keyOf = (items: Item[]) => items.map((p) => p.remote ?? p.folder).sort().join('\n')
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) ?? '' } catch { return '' } }

/** 홈 카드: 다른 컴퓨터의 프로젝트가 있을 때. 닫으면 목록이 바뀔 때까지 숨긴다 */
export function ElsewhereHomeCard({ setup }: { setup?: SetupView }) {
  const { busy, error, fetch, fetchAll } = useElsewhere()
  const [hidden, setHidden] = useState(readHidden)
  const items = setup?.elsewhere ?? []
  if (!items.length || hidden === keyOf(items)) return null
  const hide = () => { const k = keyOf(items); setHidden(k); try { localStorage.setItem(HIDE_KEY, k) } catch { /* 숨김을 기억하지 못할 뿐 */ } }
  const shown = items.slice(0, 4)
  return (
    <div className="setup-home elsewhere-home card" data-ui="다른 컴퓨터의 프로젝트 카드">
      <div className="elsewhere-top">
        <span className="set-name">{t(`다른 컴퓨터의 프로젝트 ${items.length}개`, `${items.length} projects on your other computers`)}</span>
        <button className="icon-btn" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={hide}>{Icon.x}</button>
      </div>
      <span className="setup-desc">{t('이 컴퓨터에는 아직 없습니다. 받을 것을 고르세요.', 'They are not on this computer yet. Choose what to download.')}</span>
      <div className="set-rows elsewhere-list">
        {shown.map((p) => <ProjectRow key={p.folder} p={p} busy={busy} onFetch={() => void fetch(p)} />)}
      </div>
      <div className="elsewhere-foot">
        {items.length > shown.length && <button className="a" onClick={() => go({ page: 'settings', part: 'google' })}>{t(`${items.length - shown.length}개 더 보기`, `${items.length - shown.length} more`)}</button>}
        <span className="sp" />
        <button className="btn primary" disabled={!!busy} onClick={() => void fetchAll(items)}>{busy === '*' ? t('받는 중…', 'Downloading…') : t('모두 받기', 'Download all')}</button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  )
}
