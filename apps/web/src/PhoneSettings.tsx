import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { phoneApi, type PhoneStatus } from './api'
import { t } from './i18n'

/**
 * 설정 › 폰에서 보기 (10/30 사용자 결정 "Tailscale, 읽기와 답·메모"): 이 맥의 앱을 Tailscale로 이어진 내 기기에서 연다.
 * 켜면 맥이 `tailscale serve`로 이 앱을 https://<맥>.<tailnet>.ts.net 에 걸고, 주소와 QR을 보여 준다. 서버 phone.ts.
 */
export function PhoneSettings() {
  const [st, setSt] = useState<PhoneStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const load = () => { setErr(null); return phoneApi.status().then(setSt).catch((e: Error) => setErr(e.message)) }
  useEffect(() => { void load() }, [])
  const act = (f: () => Promise<PhoneStatus>) => {
    setBusy(true); setErr(null)
    f().then(setSt).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false))
  }
  if (!st) return <p className="muted">{err ?? t('Tailscale 상태를 읽는 중…', 'Reading Tailscale status…')}</p>

  const recheck = <button className="btn" data-ui="다시 확인" disabled={busy} onClick={() => void load()}>{t('다시 확인', 'Check again')}</button>
  if (!st.installed || !st.running) return (
    <div className="set-rows" data-ui="폰에서 보기">
      <div className="set-row">
        <div>
          <div className="set-name">{st.installed ? t('Tailscale이 꺼져 있습니다', 'Tailscale is off') : t('이 맥에 Tailscale이 없습니다', 'Tailscale is not on this Mac')}</div>
          <div className="set-desc">
            {st.installed
              ? t('메뉴 막대의 Tailscale에서 로그인하거나 연결을 켠 뒤 다시 확인하세요.', 'Sign in or connect from Tailscale in the menu bar, then check again.')
              : <>{t('Tailscale은 내 기기끼리만 이어 주는 사설망입니다. 맥과 폰에 깔고 같은 계정으로 로그인하세요: ', 'Tailscale links only your own devices. Install it on this Mac and on your phone and sign in with the same account: ')}<a className="a" href="https://tailscale.com/download" target="_blank" rel="noreferrer">tailscale.com/download</a></>}
          </div>
          {err && <div className="error-text">{err}</div>}
        </div>
        {recheck}
      </div>
    </div>
  )

  return (
    <div className="set-rows" data-ui="폰에서 보기">
      <div className="set-row">
        <div>
          <div className="set-name">{st.on ? t('켜짐', 'On') : t('꺼짐', 'Off')}</div>
          <div className="set-desc">
            {t(`Tailscale로 이어진 내 기기(${st.login ?? '같은 계정'})에서만 열립니다. 바깥 인터넷에는 열리지 않습니다. 폰에서 읽고, 피드백에 답하고, 기록 메모와 에이전트 대화를 할 수 있습니다.`,
              `Opens only on your devices linked by Tailscale (${st.login ?? 'same account'}). It is not open to the internet. On the phone you can read, answer feedback, and write record memos and agent chats.`)}
          </div>
          {st.error && <div className="error-text">{st.enableUrl
            ? <>{t('Tailscale에서 HTTPS를 처음 한 번 허락해야 합니다. ', 'Allow HTTPS in Tailscale once first. ')}<a className="a" href={st.enableUrl} target="_blank" rel="noreferrer">{t('허락하러 가기', 'Open Tailscale')}</a>{t(' 뒤 다시 켜세요.', ', then turn it on again.')}</>
            : st.error}</div>}
          {err && <div className="error-text">{err}</div>}
        </div>
        {st.on
          ? <button className="btn" data-ui="폰에서 보기 끄기" disabled={busy} onClick={() => act(phoneApi.off)}>{t('끄기', 'Turn off')}</button>
          : <button className="btn primary" data-ui="폰에서 보기 켜기" disabled={busy} onClick={() => act(phoneApi.on)}>{busy ? t('켜는 중…', 'Turning on…') : t('켜기', 'Turn on')}</button>}
      </div>
      {st.on && st.url && <div className="set-row phone-open" data-ui="폰 주소">
        <div>
          <div className="phone-url"><code>{st.url}</code>
            <button className="btn sm" data-ui="주소 복사" onClick={() => void navigator.clipboard?.writeText(st.url!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => undefined)}>{copied ? t('복사했습니다', 'Copied') : t('복사', 'Copy')}</button>
          </div>
          <div className="set-desc">
            {t('폰에 Tailscale 앱을 깔고 같은 계정으로 로그인한 뒤, 카메라로 QR을 찍으세요. 브라우저의 "홈 화면에 추가"를 누르면 앱처럼 열립니다. 이 맥이 잠자면 폰에서도 열리지 않습니다.',
              'Install the Tailscale app on your phone, sign in with the same account, then scan the QR code with the camera. "Add to Home Screen" in the browser makes it open like an app. When this Mac sleeps, it will not open on the phone.')}
          </div>
        </div>
        <Qr text={st.url} />
      </div>}
    </div>
  )
}

/** 주소의 QR 그림. 칸마다 점 하나, 둘레 4칸은 비워 둔다(카메라가 가장자리를 찾게) */
function Qr({ text }: { text: string }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    const n = q.getModuleCount()
    const dark: string[] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dark.push(`M${c + 4} ${r + 4}h1v1h-1z`)
    return { size: n + 8, path: dark.join('') }
  }, [text])
  return (
    <svg className="phone-qr" viewBox={`0 0 ${cells.size} ${cells.size}`} role="img" aria-label={t('폰에서 열 주소의 QR', 'QR code of the phone address')} shapeRendering="crispEdges">
      <path d={cells.path} />
    </svg>
  )
}
