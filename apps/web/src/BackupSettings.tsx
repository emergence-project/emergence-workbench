import { useEffect, useState } from 'react'
import { backupApi, type BackupStatus } from './api'
import { locale, t } from './i18n'

/**
 * 설정 화면의 "백업" 묶음 (10/4 사용자 결정): 연구 저장소에 올라가지 않는 workbench/와 앱 설정을
 * 비공개 저장소에 두고 그것을 정본으로 한 시간마다 양쪽 맞춘다. 여기서는 마지막 결과를 보고 바로 맞춘다.
 */
export function BackupSettings() {
  const [st, setSt] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = () => backupApi.status().then(setSt).catch((e: Error) => setErr(e.message))
  useEffect(() => { void load() }, [])
  if (!st) return <p className="muted">{err ?? t('백업 상태를 읽는 중…', 'Reading backup status…')}</p>
  if (!st.enabled) return <p className="set-desc" style={{ maxWidth: 'none' }}>{t('실사용 앱에서만 백업합니다 (개발용 예제 모드에서는 하지 않음).', 'Backup runs only in the real app (not in sample mode for development).')}</p>
  const last = st.last
  return (
    <div className="set-rows" data-ui="백업">
      <div className="set-row">
        <div>
          <div>{last ? last.message : t('아직 이번 실행에서 백업하지 않았습니다', 'No backup yet since the app started')}</div>
          <div className="set-desc" style={{ maxWidth: 'none' }}>
            {last && `${new Date(last.at).toLocaleString(locale())}${last.commit ? ` · ${last.commit}` : ''} · `}
            {t(`연구 저장소에 올라가지 않는 workbench/와 앱 설정(구글 열쇠 빼고)은 ${st.remote}가 정본입니다. 한 시간마다 맞춥니다: 이 맥에서 고친 것은 올리고, GitHub에서 고친 것은 받습니다. 양쪽에서 다르게 고친 파일은 이 맥 것을 두고 GitHub 것을 옆에 \`이름.github-날짜\`로 받아 둡니다.`,
              `${st.remote} is the source of truth for workbench/ folders that are not pushed to the research repositories and for app settings (except Google keys). It syncs every hour: changes made on this Mac are pushed and changes made on GitHub are pulled. When a file was changed differently on both sides, the Mac copy is kept and the GitHub copy is saved next to it as \`name.github-date\`.`)}
            {last && last.conflicts.length > 0 && <div>{t('양쪽에서 고친 파일: ', 'Changed on both sides: ')}{last.conflicts.join(', ')}</div>}
          </div>
          {err && <div className="error-text">{err}</div>}
        </div>
        <button className="btn" data-ui="지금 백업" disabled={busy || st.running} onClick={() => {
          setBusy(true); setErr(null)
          backupApi.run().then(() => load()).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false))
        }}>{busy || st.running ? t('맞추는 중…', 'Syncing…') : t('지금 맞추기', 'Sync now')}</button>
      </div>
    </div>
  )
}
