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
  // 하나가 안 돼도 나머지는 계속 받고, 안 된 것은 그 줄에 이유를 둔다 (10/22 맥미니: 모두 받기가 첫 오류에서 멈춤)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fetchOne = async (p: Item) => {
    if (!p.remote) return
    const v = await setupApi.fetchProject({ remote: p.remote, folder: p.folder, tags: p.tags })
    client.setQueryData(qk.setup, v)
    void client.invalidateQueries({ queryKey: qk.researches })
  }
  const run = async (key: string, items: Item[]) => {
    setBusy(key)
    setErrors((old) => { const next = { ...old }; for (const p of items) delete next[p.folder]; return next })
    for (const p of items) {
      try { await fetchOne(p) } catch (e) { setErrors((old) => ({ ...old, [p.folder]: (e as Error).message })) }
    }
    setBusy(null)
  }
  return { busy, errors, fetch: (p: Item) => run(p.folder, [p]), fetchAll: (items: Item[]) => run('*', items.filter((p) => p.remote)) }
}

/** 이미 받아 둔 것은 등록만, 없는 것은 받기: 버튼과 머리 글을 이 수로 쓴다 */
const countOf = (items: Item[]) => ({ register: items.filter((p) => p.remote && p.local).length, download: items.filter((p) => p.remote && !p.local).length })
const allLabel = (items: Item[]) => {
  const { register, download } = countOf(items)
  return register && download ? t(`모두 등록 · 받기 (${register + download})`, `Register and download all (${register + download})`)
    : register ? t(`모두 등록 (${register})`, `Register all (${register})`) : t(`모두 받기 (${download})`, `Download all (${download})`)
}
const summary = (items: Item[]) => {
  const { register, download } = countOf(items)
  return [register && t(`${register}개는 이 컴퓨터에 받아 둔 폴더가 있어 등록만 하면 됩니다`, `${register} already have a folder on this computer and only need registering`),
    download && t(`${download}개는 받아야 합니다`, `${download} need downloading`)].filter(Boolean).join(t(', ', ', ')) + '.'
}

function ProjectRow({ p, busy, error, onFetch }: { p: Item; busy: string | null; error?: string; onFetch(): void }) {
  const state = p.state as ProjectState | undefined
  return (
    <div className="setup-row elsewhere-row">
      {state && PROJECT_STATE_DOT[state] ? <StatusDot s={PROJECT_STATE_DOT[state]} /> : <span />}
      <div className="setup-main">
        <div className="set-name">{p.title}{state && PROJECT_STATE_LABEL[state] && <small className="setup-sub">{PROJECT_STATE_LABEL[state]}</small>}</div>
        <div className="setup-desc">{p.local ? t(`이 컴퓨터에 이미 있음: ${p.local}`, `Already on this computer: ${p.local}`) : p.remote ?? t('GitHub 주소 없음', 'No GitHub address')}</div>
        {error && <div className="error-text" role="alert">{error}</div>}
      </div>
      {p.remote && <div className="setup-act">
        <button className="btn" disabled={!!busy} onClick={onFetch}>{busy === p.folder ? t('받는 중…', 'Downloading…') : p.local ? t('등록', 'Register') : t('받기', 'Download')}</button>
      </div>}
    </div>
  )
}

/** 설정 › 계정 › 시작 준비의 절 */
export function ElsewhereSection({ setup }: { setup?: SetupView }) {
  const { busy, errors, fetch, fetchAll } = useElsewhere()
  const items = setup?.elsewhere ?? []
  if (!items.length) return null
  const machines = [...new Set(items.map((p) => p.machine))].join(' · ')
  return (
    <>
      <div className="sec-head elsewhere-head">
        <h3 className="set-h3">{t('다른 컴퓨터의 프로젝트', 'Projects on your other computers')} <small className="setup-sub">{machines}</small></h3>
        <button className="btn primary" disabled={!!busy} onClick={() => void fetchAll(items)}>{busy === '*' ? t('받는 중…', 'Downloading…') : allLabel(items)}</button>
      </div>
      <p className="setup-desc elsewhere-note">{t(`개인 저장소에 올라온 목록 중 이 컴퓨터에 등록하지 않은 것입니다. ${summary(items)} 받을 곳: ${setup!.cloneDir}`, `Projects listed in your personal repository that are not registered on this computer. ${summary(items)} Downloaded to ${setup!.cloneDir}`)}</p>
      <div className="set-rows" data-ui="다른 컴퓨터의 프로젝트">
        {items.map((p) => <ProjectRow key={p.folder} p={p} busy={busy} error={errors[p.folder]} onFetch={() => void fetch(p)} />)}
      </div>
    </>
  )
}

const HIDE_KEY = 'rw.elsewhere.hidden'
const keyOf = (items: Item[]) => items.map((p) => p.remote ?? p.folder).sort().join('\n')
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) ?? '' } catch { return '' } }

/** 홈 카드: 다른 컴퓨터의 프로젝트가 있을 때. 닫으면 목록이 바뀔 때까지 숨긴다 */
export function ElsewhereHomeCard({ setup }: { setup?: SetupView }) {
  const { busy, errors, fetch, fetchAll } = useElsewhere()
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
      <span className="setup-desc">{t(`이 컴퓨터에 아직 등록하지 않았습니다. ${summary(items)}`, `Not registered on this computer yet. ${summary(items)}`)}</span>
      <div className="set-rows elsewhere-list">
        {shown.map((p) => <ProjectRow key={p.folder} p={p} busy={busy} error={errors[p.folder]} onFetch={() => void fetch(p)} />)}
      </div>
      <div className="elsewhere-foot">
        {items.length > shown.length && <button className="a" onClick={() => go({ page: 'settings', part: 'google' })}>{t(`${items.length - shown.length}개 더 보기`, `${items.length - shown.length} more`)}</button>}
        <span className="sp" />
        <button className="btn primary" disabled={!!busy} onClick={() => void fetchAll(items)}>{busy === '*' ? t('받는 중…', 'Downloading…') : allLabel(items)}</button>
      </div>
    </div>
  )
}
