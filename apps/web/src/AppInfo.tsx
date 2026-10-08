import { useEffect, useState } from 'react'
import { req } from './api'
import { t } from './i18n'

interface Info {
  version: { number: string; commit: string; date: string }
  root: string
  branch: string | null
  remote: string | null
  history: { commit: string; version: string; time: string; title: string; pr?: number }[]
}

/**
 * 설정 › 앱 기본정보 (10/4 18:17 피드백 "앱 기본정보로 바꾸고, 앱에 대한 버젼관리와 함께 기본정보를 기술해줘"):
 * 이 앱이 무엇이고 어디에 있는지, 지금 버전과 업데이트 이력(PR · 버전 · 내용 · 일시, 10/8). 업데이트는 그 아래.
 */
export function AppInfo() {
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  useEffect(() => {
    req('/api/app/info').then((r) => r.json()).then((b) => setInfo(b.enabled ? b.info : null)).catch(() => setInfo(null))
  }, [])
  const pr = (n: number) => (info?.remote ? <a className="a" href={`${info.remote}/pull/${n}`} target="_blank" rel="noreferrer">#{n}</a> : `#${n}`)
  return (
    <div className="app-info" data-ui="앱 기본정보">
      <dl className="props">
        <dt>{t('이름', 'Name')}</dt><dd>{t('Emergence Workbench (연구 작업대, 저장소 emergence-workbench)', 'Emergence Workbench (repository emergence-workbench)')}</dd>
        <dt>{t('하는 일', 'What it does')}</dt><dd>{t('여러 연구의 노트·유도·논문 읽기·할 일을 한 창에서 다루는 이 맥의 로컬 앱', 'A local app on this Mac that keeps notes, derivations, paper reading and to-dos for several projects in one window')}</dd>
        <dt>{t('지금 버전', 'Current version')}</dt><dd>{info ? <>{info.version.number && <b>{info.version.number} · </b>}{info.version.date} · <code>{info.version.commit}</code>{info.branch && <span className="muted"> · {info.branch}</span>}</> : info === null ? <span className="muted">{t('개발용 예제 모드에서는 버전을 따로 보이지 않습니다', 'The version is not shown in sample mode')}</span> : '…'}</dd>
        <dt>{t('버전 관리', 'Version control')}</dt><dd><span>{t('', 'The main branch of ')}{info?.remote ? <a className="a" href={info.remote} target="_blank" rel="noreferrer">{info.remote.replace(/^https:\/\//, '')}</a> : 'GitHub emergence-workbench'}{t('의 main이 정본입니다. ', ' is the source of truth. ')}<span className="muted">{t('Claude가 고친 것은 PR로 합쳐지고, 이 맥은 아래 업데이트로 받습니다.', 'Changes by Claude are merged through PRs, and this Mac gets them with the update below.')}</span></span></dd>
        {info && <><dt>{t('앱 폴더', 'App folder')}</dt><dd><code>{info.root}</code></dd></>}
        <dt>{t('앱 설정', 'App settings')}</dt><dd><code>~/.config/research-workspace/config.yaml</code></dd>
        <dt>{t('피드백', 'Feedback')}</dt><dd><code>~/.config/research-workspace/personal/feedback/</code><span className="muted">{t('(개인 저장소 사본 안, 비공개 개인 저장소에 올라감)', ' (inside the personal repository copy, pushed to your private repository)')}</span></dd>
      </dl>
      {info && info.history.length > 0 && (
        <>
          <h3 className="app-info-h">{t('업데이트 이력', 'Update history')}</h3>
          <table className="app-history" data-ui="버전 이력">
            <thead><tr><th>PR</th><th>{t('버전', 'Version')}</th><th>{t('내용', 'Change')}</th><th>{t('일시', 'Date')}</th></tr></thead>
            <tbody>
              {info.history.map((h) => (
                <tr key={h.commit}>
                  <td className="muted">{h.pr ? pr(h.pr) : <code>{h.commit}</code>}</td>
                  <td className="app-history-num">{h.version}</td>
                  <td>{h.title}</td>
                  <td className="muted app-history-num">{h.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
