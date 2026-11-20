import { useQuery } from '@tanstack/react-query'
import { devicesApi, type Device, type DeviceAccount } from './api'
import { relativeTime } from './format'
import { t } from './i18n'
import { qk } from './queries'

/**
 * 설정 › 서버 › 기기 (11/20 사용자 "클로드 기기관리처럼", "설정에서 관리"): 이 앱을 쓰는 컴퓨터마다 한 줄.
 * 다른 컴퓨터는 개인 저장소에 올린 마지막 값이다 (1시간마다 맞춤, 서버 devices.ts). 로그아웃 · 에이전트가 도는 곳은 다음 단계
 */
export function DeviceList() {
  const q = useQuery({ queryKey: qk.devices, queryFn: devicesApi.get, refetchInterval: 5 * 60_000 })
  const d = q.data
  return (<>
    <h3 className="set-h3">{t('기기', 'Devices')}</h3>
    <p className="set-desc">{t('이 앱을 쓰는 컴퓨터입니다. 다른 컴퓨터는 개인 저장소에 올린 마지막 값이라 1시간쯤 늦을 수 있습니다. 로그인 열쇠 · 이메일은 올리지 않고 이름 · 시각 · 앱 버전 · 계정 이름만 올립니다.', 'Computers that use this app. Other computers show what they last uploaded to your personal repository, so it can be up to an hour old. Only names, times, the app version and account names are uploaded, never sign-in keys or emails.')}</p>
    <div className="setup set-rows dev-list" data-ui="기기 목록">
      {!d ? <p className="muted setup-row">{q.error?.message ?? t('읽는 중…', 'Reading…')}</p>
        : d.devices.map((x) => <DeviceRow key={x.name} d={x} />)}
    </div>
    {d && !d.shared && <p className="muted set-desc">{t('개인 저장소와 맞추지 않아 이 컴퓨터만 보입니다. 계정에서 GitHub에 로그인하고 개인 저장소를 정하면 다른 컴퓨터도 보입니다.', 'Only this computer is shown because it does not sync with a personal repository. Sign in to GitHub and choose a personal repository under Account to see your other computers.')}</p>}
  </>)
}

const KIND: Record<DeviceAccount['kind'], string> = { github: 'GitHub', claude: 'Claude', codex: 'Codex', google: t('구글', 'Google') }
const accountName = (a: DeviceAccount) => [KIND[a.kind], a.name, a.plan].filter(Boolean).join(' · ')

function DeviceRow({ d }: { d: Device }) {
  const state = d.this ? t('켜짐 · 지금', 'On · now') : d.online ? t(`켜짐 · ${relativeTime(Date.parse(d.seen))}`, `On · ${relativeTime(Date.parse(d.seen))}`) : t(`꺼짐 · ${relativeTime(Date.parse(d.seen))}`, `Off · ${relativeTime(Date.parse(d.seen))}`)
  const name = d.online ? t('켜짐', 'On') : t('꺼짐', 'Off')
  return (
    <div className={`setup-row dev-row${d.online ? '' : ' off'}`} data-ui="기기 줄">
      <span className={`g ${d.online ? 'solved' : 'stopped'}`} role="img" aria-label={name} title={name} />
      <div className="setup-main">
        <div className="set-name">{d.label ?? d.name}{d.this && <small className="setup-sub">{t('이 기기', 'This device')}</small>}</div>
        <div className="setup-desc dev-meta">
          <span>{state}</span>
          {d.version && <span>{t(`앱 ${d.version}`, `App ${d.version}`)}</span>}
          {d.os && <span>{d.os}</span>}
        </div>
        {d.accounts.length > 0 && <div className="dev-accts" data-ui="기기 계정">{d.accounts.map((a, i) => <span key={i} className="tag">{accountName(a)}</span>)}</div>}
      </div>
    </div>
  )
}
