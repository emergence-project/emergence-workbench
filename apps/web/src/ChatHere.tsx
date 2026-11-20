// 새 대화를 어디서 돌릴지 (11/20 사용자 「그렇게하자」): 서버가 다른 컴퓨터면 서버(기본) | 이 맥.
// 서버에 닿지 않으면 이 맥으로 돌리고 그 까닭을 한 줄로 보인다
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { devicesApi } from './api'
import { HERE, t } from './i18n'
import { qk } from './queries'
import { store } from './store'

const KEY = 'rw-agent-here'

/** here = 이 맥에서 돌림. show = 고르기를 보일지 (서버가 다른 컴퓨터일 때만) */
export function useChatHere() {
  const p = useQuery({ queryKey: qk.chatPlace, queryFn: devicesApi.chatPlace, refetchInterval: 60_000 }).data
  const [pick, setPick] = useState(() => store.get<boolean>(KEY, false))
  const set = (v: boolean) => { setPick(v); store.set(KEY, v) }
  const down = !!p?.remote && !!p.error
  return { show: !!p?.remote, here: !!p?.remote && (pick || down), down, server: p?.server?.label ?? p?.server?.machine ?? '', set }
}

export function ChatHerePick({ h }: { h: ReturnType<typeof useChatHere> }) {
  if (!h.show) return null
  const opts: [boolean, string][] = [[false, t('서버', 'Server')], [true, t(HERE.ko, HERE.En)]]
  return (
    <div className="ac-here-pick" data-ui="대화 도는 곳 고르기">
      <div className="segmented small" role="radiogroup" aria-label={t('대화를 돌릴 곳', 'Where the chat runs')}>
        {opts.map(([v, label]) => <button key={label} role="radio" aria-checked={h.here === v} className={h.here === v ? 'on' : ''} disabled={h.down} onClick={() => h.set(v)}>{label}</button>)}
      </div>
      <span className={`muted${h.down ? ' error-text' : ''}`}>{h.down
        ? t(`서버(${h.server})에 닿지 않아 ${HERE.ko}에서 돌립니다`, `Cannot reach the server (${h.server}), so it runs on ${HERE.en}`)
        : h.here ? t(`${HERE.ko}의 계정 · 폴더로 일하고, ${HERE.ko}에서만 이어 씁니다`, `Uses the accounts and folders of ${HERE.en}; continue it on ${HERE.en} only`)
          : t(`${h.server}에서 돌아 어느 컴퓨터에서든 이어 씁니다`, `Runs on ${h.server}; continue it from any computer`)}</span>
    </div>
  )
}
