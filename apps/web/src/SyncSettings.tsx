import { SYNC_LIMITS, SYNC_PRESETS, syncEveryLabel, type SyncChoice, type SyncKind } from '@rw/core'
import type { SyncSettingsView } from '@rw/core/contract/settings'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { lang, t } from './i18n'

const ROWS: { kind: SyncKind; ui: string; name: () => string; desc: () => string; warn(c: SyncChoice): string | null }[] = [
  {
    kind: 'publish', ui: '기록 올리기 주기',
    name: () => t('기록 · 피드백 올리기', 'Push records and feedback'),
    desc: () => t('자동이면 기록이나 피드백을 쓰고 고른 시간이 지나면 GitHub에 올립니다(그 사이 더 쓰면 다시 셉니다). 수동이면 "지금 올리기"로만 올립니다. 어느 쪽이든 기록 탭 맨 위의 "지금 올리기"로 바로 올릴 수 있습니다.',
      'With Auto, records and feedback are pushed to GitHub after the chosen time (writing again restarts the count). With Manual, only "Push now" pushes. Either way, "Push now" at the top of the Records tab pushes right away.'),
    warn: (c) => (c.mode === 'manual' || c.every > 300 ? t('클라우드 에이전트가 기록을 늦게 봅니다.', 'Cloud agents see your records later.') : null),
  },
  {
    kind: 'pull', ui: '받기 주기',
    name: () => t('연구 저장소 · 라이브러리 받기', 'Pull research repositories and the library'),
    desc: () => t('자동이면 GitHub에서 바뀐 것을 고른 간격마다 받습니다. 클라우드 에이전트의 답이 앱에 뜨는 간격입니다. 수동이면 프로젝트 정보 › 저장소의 "받기"로만 받습니다.',
      'With Auto, changes on GitHub are pulled at the chosen interval; this is how soon cloud agent answers show up. With Manual, pull only with "Pull" in Project info › Repository.'),
    warn: (c) => (c.mode === 'manual' ? t('맥과 GitHub가 갈라지면 받을 때 합쳐야 할 수 있습니다.', 'If the Mac and GitHub diverge, you may need to merge when pulling.') : null),
  },
  {
    kind: 'update', ui: '업데이트 주기',
    name: () => t('앱 업데이트 확인', 'Check for app updates'),
    desc: () => t('자동이면 고른 간격마다 새 버전이 있는지만 봅니다. 새 버전이 있을 때만 받아서 앱을 쓰지 않는 동안 바꾸고, 이미 최신이면 받기 · 빌드 · 다시 켜기를 하지 않습니다. 수동이면 앱 기본정보의 "업데이트"로만.',
      'With Auto, only checks for a new version at the chosen interval. It downloads and switches only when one exists, while the app is idle; when already up to date it does not download, build or restart. With Manual, update only from About this app.'),
    warn: () => null,
  },
]

/** 직접 적을 때의 단위: 올리기는 초부터, 받기 · 업데이트는 분부터 */
const UNITS: Record<SyncKind, { sec: number; label: () => string }[]> = {
  publish: [{ sec: 1, label: () => t('초', 's') }, { sec: 60, label: () => t('분', 'min') }, { sec: 3600, label: () => t('시간', 'h') }],
  pull: [{ sec: 60, label: () => t('분', 'min') }, { sec: 3600, label: () => t('시간', 'h') }],
  update: [{ sec: 60, label: () => t('분', 'min') }, { sec: 3600, label: () => t('시간', 'h') }],
}

/**
 * 설정 › 동기화 (10/19 결정 "동기화 주기", 시안 10/18 6절): 칸마다 수동 | 자동, 자동이면 간격 셋과 직접.
 * 바꾸면 앱을 다시 켜지 않아도 바로 적용된다(서버 syncTiming.ts).
 */
export function SyncSettings() {
  const [s, setS] = useState<SyncSettingsView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.syncSettings().then(setS).catch((e: Error) => setErr(e.message)) }, [])
  // 빠르게 여러 번 바꿀 때 늦게 온 앞 응답이 뒤 값을 덮지 않게 마지막 요청의 응답만 쓴다
  const seq = useRef(0)
  const save = (kind: SyncKind, patch: Partial<SyncChoice>) => {
    setErr(null)
    const n = ++seq.current
    api.saveSyncSettings({ [kind]: patch }).then((v) => { if (n === seq.current) setS(v) }).catch((e: Error) => setErr(e.message))
  }
  if (!s) return <p className="muted">{err ?? t('설정을 읽는 중…', 'Reading settings…')}</p>
  return (
    <div className="set-rows" data-ui="동기화">
      {err && <div className="error-text">{err}</div>}
      {ROWS.map((row) => {
        const c = s[row.kind]
        const on = s.available[row.kind]
        const warn = on ? row.warn(c) : null
        return <div key={row.kind} className="set-row" data-ui={row.ui}>
          <div>
            <div className="set-name">{row.name()}</div>
            <div className="set-desc">{row.desc()}</div>
            {!on && <div className="set-desc muted">{t('이 앱에서는 하지 않습니다(개발용 예제 모드이거나 앱 사본이 아님).', 'This app does not do this (sample mode, or not an app checkout).')}</div>}
            {warn && <div className="sync-warn">{warn}</div>}
          </div>
          <SyncPick kind={row.kind} c={c} disabled={!on} onSave={(p) => save(row.kind, p)} />
        </div>
      })}
    </div>
  )
}

function SyncPick({ kind, c, disabled, onSave }: { kind: SyncKind; c: SyncChoice; disabled: boolean; onSave(p: Partial<SyncChoice>): void }) {
  const presets = SYNC_PRESETS[kind]
  const custom = !presets.includes(c.every)
  const [own, setOwn] = useState(custom)
  const units = UNITS[kind]
  const unit = [...units].reverse().find((u) => c.every % u.sec === 0) ?? units[0]!
  const [n, setN] = useState(String(c.every / unit.sec))
  const [u, setU] = useState(unit.sec)
  useEffect(() => { setN(String(c.every / unit.sec)); setU(unit.sec) }, [c.every]) // eslint-disable-line react-hooks/exhaustive-deps
  const [lo, hi] = SYNC_LIMITS[kind]
  const commit = (value = n, per = u) => {
    const sec = Math.round(Number(value) * per)
    if (Number.isFinite(sec) && sec >= lo && sec <= hi && sec !== c.every) onSave({ every: sec })
    else { setN(String(c.every / unit.sec)); setU(unit.sec) }
  }
  const auto = c.mode === 'auto'
  const ko = lang === 'ko'
  const after = kind === 'publish' ? t(' 뒤', '') : ''
  return <div className="sync-pick">
    <div className="segmented small" role="radiogroup" aria-label={t('수동 · 자동', 'Manual or auto')} data-ui="수동 자동">
      {(['manual', 'auto'] as const).map((m) => <button key={m} role="radio" aria-checked={c.mode === m} className={c.mode === m ? 'on' : ''} disabled={disabled} onClick={() => onSave({ mode: m })}>{m === 'manual' ? t('수동', 'Manual') : t('자동', 'Auto')}</button>)}
    </div>
    <div className={`segmented small${auto ? '' : ' off'}`} role="radiogroup" aria-label={t('간격', 'Interval')} data-ui="간격">
      {presets.map((p) => <button key={p} role="radio" aria-checked={auto && !own && c.every === p} className={!own && c.every === p ? 'on' : ''} disabled={disabled || !auto}
        onClick={() => { setOwn(false); onSave({ every: p }) }}>{syncEveryLabel(p, ko)}{after}</button>)}
      <button role="radio" aria-checked={own || custom} className={own || custom ? 'on' : ''} disabled={disabled || !auto} onClick={() => setOwn(true)}>{t('직접', 'Custom')}</button>
    </div>
    {auto && (own || custom) && <div className="sync-own" data-ui="간격 직접">
      <input type="number" min={1} value={n} disabled={disabled} aria-label={t('간격', 'Interval')} onChange={(e) => setN(e.target.value)} onBlur={() => commit()} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} />
      <select value={u} disabled={disabled} aria-label={t('단위', 'Unit')} onChange={(e) => { const per = Number(e.target.value); setU(per); commit(n, per) }}>
        {units.map((x) => <option key={x.sec} value={x.sec}>{x.label()}</option>)}
      </select>
      <span className="muted">{kind === 'publish' ? t('뒤', 'later') : t('마다', 'each')}</span>
    </div>}
  </div>
}
