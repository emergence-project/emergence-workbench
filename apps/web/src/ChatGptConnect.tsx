import type { CodexStatus } from '@rw/core/contract/settings'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { AgentLogo } from './agentLogos'
import { t } from './i18n'
import { qk } from './queries'

const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`

/** 단계 글: 받는 중 n% · 로그인 기다리는 중 · 준비됨 */
function codexLine(s: CodexStatus | undefined): string {
  if (!s) return t('확인하는 중…', 'Checking…')
  if (s.busy?.step === 'install') return s.busy.total
    ? t(`Codex 받는 중 ${Math.floor(s.busy.received / s.busy.total * 100)}% (${mb(s.busy.received)} / ${mb(s.busy.total)})`, `Downloading Codex ${Math.floor(s.busy.received / s.busy.total * 100)}% (${mb(s.busy.received)} / ${mb(s.busy.total)})`)
    : t('Codex 받는 중…', 'Downloading Codex…')
  if (s.busy?.step === 'login') return t('브라우저에서 ChatGPT 계정으로 로그인해 주세요. 로그인하면 여기로 돌아옵니다.', 'Sign in with your ChatGPT account in the browser. This continues once you are signed in.')
  if (s.installed && s.login) return t(`준비됨 (${s.version ?? 'Codex'}, ChatGPT 로그인됨)`, `Ready (${s.version ?? 'Codex'}, signed in to ChatGPT)`)
  if (s.installed) return t(`Codex 있음 (${s.version ?? '버전 모름'}). ChatGPT 로그인이 남았습니다.`, `Codex installed (${s.version ?? 'unknown version'}). ChatGPT sign-in remains.`)
  return t('처음 한 번 Codex(OpenAI가 내는 프로그램, 약 180MB)를 받습니다.', 'The first time, Codex (a program from OpenAI, about 180 MB) is downloaded.')
}

/**
 * "ChatGPT로 연결" 하나로 (11/8): Codex가 없으면 받고 → 로그인이 안 됐으면 브라우저 로그인.
 * 계정 페이지 Codex 「이 컴퓨터」 줄에 있다 (11/20 사용자 "옮기자": 같은 ~/.codex 로그인이라 옛 설정 › 에이전트의 연결과 한 줄로).
 * 서버는 시작만 하고 바로 돌려주므로 진행 중에는 상태를 1.5초마다 다시 읽는다.
 */
export function ChatGptConnect({ onDone }: { onDone(): void }) {
  const [going, setGoing] = useState(false)
  const tried = useRef<{ install?: boolean; login?: boolean }>({})
  const status = useQuery({
    queryKey: qk.codex, queryFn: api.codexStatus,
    refetchInterval: (q) => (going || q.state.data?.busy ? 1500 : false),
  })
  const client = useQueryClient()
  const start = useMutation({
    mutationFn: (step: 'install' | 'login') => step === 'install' ? api.installCodex() : api.loginCodex(),
    onSuccess: (s) => client.setQueryData(qk.codex, s),
    onError: () => setGoing(false),
  })
  const s = status.data
  useEffect(() => {
    if (!going || !s || s.busy || start.isPending) return
    if (s.installed && s.login) { setGoing(false); onDone(); return }
    if (!s.installed) {
      if (tried.current.install) { setGoing(false); return }
      tried.current.install = true
      start.mutate('install')
      return
    }
    if (tried.current.login) { setGoing(false); return }
    tried.current.login = true
    start.mutate('login')
  }, [going, s, start, onDone])
  return (<span className="chatgpt-connect" data-ui="ChatGPT로 연결">
    <span>{t('ChatGPT 유료 계정(Plus 이상)으로 로그인하면 Codex 대화와 질문 답이 따로 돈을 내지 않고 그 요금제 안에서 돕니다. ', 'Sign in with a paid ChatGPT account (Plus or higher) and Codex conversations and answers come out of that plan, with no extra charge. ')}{codexLine(s)}</span>
    {(s?.error || start.error) && <span className="error-text">{s?.error ?? start.error?.message}</span>}
    <span className="g-actions">
      <button className="btn primary" disabled={going || !!s?.busy} onClick={() => { tried.current = {}; setGoing(true) }}>
        <AgentLogo agent="codex" />{going || s?.busy ? t('연결하는 중…', 'Connecting…') : t('ChatGPT로 연결', 'Connect ChatGPT')}
      </button>
    </span>
  </span>)
}
