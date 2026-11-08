import type { AiKeyBody, CodexStatus } from '@rw/core/contract/settings'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { Row } from './SetupChecklist'

type Provider = AiKeyBody['provider']
const AI_ORDER: Provider[] = ['chatgpt', 'gemini', 'claude']
export const AI_NAME: Record<Provider, string> = { claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT' }
const AI_KEY_PAGE: Record<Exclude<Provider, 'chatgpt'>, string> = { claude: 'https://console.anthropic.com/settings/keys', gemini: 'https://aistudio.google.com/apikey' }

/**
 * 질문에 답할 AI (11/8 "인공지능 에이전트가 없는 친구도 논문을 읽으며 질문", 사용자 "둘 다 고를 수 있게" → "A, B, C 다, 친구는 앱에서 간단히 고를 수만"):
 * ChatGPT(유료 계정으로 Codex에 로그인) · Gemini 키 · Claude 키 중 하나를 고르면 논문 · 노트 기록의 질문에 이 앱이 그 AI를 직접 불러 답한다.
 * 키는 이 컴퓨터의 설정 폴더에만 두고 화면에는 끝 네 자만 보인다. ChatGPT는 키 대신 "ChatGPT로 연결" 한 번(Codex 받기 → 브라우저 로그인).
 */
export function AiKeyRow({ onSaved }: { onSaved(message: string): void }) {
  const client = useQueryClient()
  const key = useQuery({ queryKey: qk.aiKey, queryFn: api.aiKey })
  const [form, setForm] = useState(false)
  const [provider, setProvider] = useState<Provider>('chatgpt')
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const put = (k: Awaited<ReturnType<typeof api.aiKey>>) => client.setQueryData(qk.aiKey, k)
  const close = () => { setForm(false); setValue(''); setErr(null) }
  const save = useMutation({
    mutationFn: (body: AiKeyBody) => api.saveAiKey(body),
    onSuccess: (k) => { put(k); close(); onSaved(k?.provider === 'chatgpt' ? t('ChatGPT로 답하게 했습니다', 'Questions now go to ChatGPT') : t('AI 키를 저장했습니다', 'Saved the AI key')) },
    onError: (e: Error) => setErr(e.message),
  })
  const remove = useMutation({
    mutationFn: api.removeAiKey,
    onSuccess: (k) => { put(k); onSaved(t('질문에 답할 AI를 지웠습니다', 'Removed the AI for questions')) },
    onError: (e: Error) => setErr(e.message),
  })
  const k = key.data
  const edit = t('바꾸기', 'Change')
  const del = t('지우기', 'Remove')
  return (<>
    <Row ok={!!k} optional name={t('질문에 답할 AI', 'AI for questions')} sub={k ? (k.provider === 'chatgpt' ? 'ChatGPT · Codex' : `${AI_NAME[k.provider]} · ${k.model}`) : 'ChatGPT · Gemini · Claude'} ui="Claude API 연결"
      action={k ? <>
        <button className="icon-btn" data-tip={edit} aria-label={edit} onClick={() => { setProvider(k.provider); setForm(true) }}>{Icon.pencil}</button>
        <button className="icon-btn" data-tip={del} aria-label={del} onClick={() => remove.mutate()}>{Icon.trash}</button>
      </> : !form && <button className="btn" onClick={() => setForm(true)}>{t('＋ 고르기', '＋ Choose')}</button>}>
      {k ? (k.provider === 'chatgpt'
        ? t('ChatGPT 계정으로 연결됨. 논문 · 노트에 남긴 질문에 ChatGPT가 답하고, 그 요금제의 사용량이 듭니다.', 'Connected with a ChatGPT account. ChatGPT answers questions left on papers and notes, using that plan\'s usage.')
        : t(`넣음 (끝 네 자 ${k.hint}). 논문 · 노트에 남긴 질문에 이 앱이 ${AI_NAME[k.provider]}에게 직접 묻습니다. 질문마다 그 계정의 사용량이 듭니다.`, `Added (ends in ${k.hint}). The app asks ${AI_NAME[k.provider]} directly for questions left on papers and notes. Each question uses that account's usage.`))
        : t('Claude Code가 없어도, ChatGPT 유료 계정이나 Gemini · Claude 키가 있으면 논문 · 노트에 남긴 질문에 이 앱이 그 AI에게 직접 묻습니다.', 'Even without Claude Code, with a paid ChatGPT account or a Gemini or Claude key, the app asks that AI directly for questions left on papers and notes.')}
      {err && <div className="error-text">{err}</div>}
    </Row>
    {form && (
      <div className="set-row" data-ui="AI 키 넣기">
        <div className="g-fields">
          <div className="segmented small" role="radiogroup" data-ui="고르기">
            {AI_ORDER.map((p) => (
              <button key={p} role="radio" aria-checked={provider === p} className={provider === p ? 'on' : ''} onClick={() => { setProvider(p); setErr(null) }}>{AI_NAME[p]}</button>
            ))}
          </div>
          {provider === 'chatgpt'
            ? <ChatGptConnect onDone={() => save.mutate({ provider: 'chatgpt' })} onCancel={close} saving={save.isPending} />
            : <>
              <span className="set-desc">{provider === 'gemini'
                ? t('구글 계정으로 Google AI Studio에 들어가 「API 키 만들기」로 받습니다. 무료로 쓸 수 있는 양이 있습니다. ', 'Sign in to Google AI Studio with a Google account and use "Create API key". There is a free allowance. ')
                : t('Anthropic 콘솔에서 크레딧을 넣고 API 키를 만듭니다. Claude 구독(Pro · Max)과는 따로 냅니다. ', 'Add credits in the Anthropic Console and create an API key. It is billed separately from a Claude subscription (Pro · Max). ')}
                <a className="a" href={AI_KEY_PAGE[provider]} target="_blank" rel="noreferrer">{t('키 만드는 곳', 'Get a key')}</a></span>
              <input className="input" type="password" placeholder={provider === 'gemini' ? 'AIza…' : 'sk-ant-…'} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
              <div className="g-actions">
                <button className="btn primary" disabled={save.isPending || value.trim().length < 8} onClick={() => save.mutate({ provider, key: value.trim() })}>{t('저장', 'Save')}</button>
                <button className="btn" onClick={close}>{t('취소', 'Cancel')}</button>
              </div>
            </>}
        </div>
      </div>
    )}
  </>)
}

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
 * "ChatGPT로 연결" 하나로: Codex가 없으면 받고 → 로그인이 안 됐으면 브라우저 로그인 → 둘 다 되면 고른다.
 * 서버는 시작만 하고 바로 돌려주므로 진행 중에는 상태를 1.5초마다 다시 읽는다.
 */
function ChatGptConnect({ onDone, onCancel, saving }: { onDone(): void; onCancel(): void; saving: boolean }) {
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
  const ready = !!s?.installed && !!s.login
  return (<>
    <span className="set-desc">{t('ChatGPT 유료 계정(Plus 이상)으로 로그인하면 따로 돈을 내지 않고 그 요금제 안에서 답합니다. ', 'Sign in with a paid ChatGPT account (Plus or higher) and answers come out of that plan, with no extra charge. ')}{codexLine(s)}</span>
    {(s?.error || start.error) && <div className="error-text">{s?.error ?? start.error?.message}</div>}
    <div className="g-actions">
      <button className="btn primary" disabled={going || saving || !!s?.busy} onClick={() => { tried.current = {}; if (ready) onDone(); else setGoing(true) }}>
        {going || s?.busy ? t('연결하는 중…', 'Connecting…') : ready ? t('ChatGPT로 답하게 하기', 'Use ChatGPT') : t('ChatGPT로 연결', 'Connect ChatGPT')}
      </button>
      <button className="btn" onClick={onCancel}>{t('취소', 'Cancel')}</button>
    </div>
  </>)
}
