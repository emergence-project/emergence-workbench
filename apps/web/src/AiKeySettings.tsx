import type { AiKeyBody, AiKeyView, AiUseBody } from '@rw/core/contract/settings'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type AgentKind } from './api'
import { AgentLogo } from './agentLogos'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { href } from './router'
import { Row } from './SetupChecklist'

type Provider = NonNullable<AiUseBody['provider']>
type KeyProvider = AiKeyBody['provider']
export const AI_NAME: Record<Provider, string> = { claude: 'Claude', gemini: 'Gemini', chatgpt: 'Codex' }
/** 고른 AI의 회사 로고 (11/9 17:15 진행: OpenAI가 나오는 곳에는 로고를 함께) */
const AI_LOGO: Record<Provider, AgentKind> = { chatgpt: 'codex', gemini: 'gemini', claude: 'claude-code' }
const AiName = ({ p }: { p: Provider }) => <span className="ag-name"><AgentLogo agent={AI_LOGO[p]} />{AI_NAME[p]}</span>
const KEY_ORDER: KeyProvider[] = ['gemini', 'claude']
const KEY_PAGE: Record<KeyProvider, string> = { claude: 'https://console.anthropic.com/settings/keys', gemini: 'https://aistudio.google.com/apikey' }
const KEY_UI: Record<KeyProvider, string> = { claude: 'Claude API 키 줄', gemini: 'Gemini API 키 줄' }

const useAiKey = () => useQuery({ queryKey: qk.aiKey, queryFn: api.aiKey })

/**
 * 계정 › AI API 키 (11/8 "인공지능 에이전트가 없는 친구도 논문을 읽으며 질문", 11/20 사용자 "옮기자": 넣기는 계정 페이지에서만):
 * Gemini · Claude API 키를 넣어 두면 설정 › 에이전트 「질문에 답할 AI」에서 고를 수 있다. 처음 넣은 키는 바로 고른다(서버 aiKey.ts).
 * 키는 이 컴퓨터의 설정 폴더 ai-key.json에만 두고 화면에는 끝 네 자만 보인다. ChatGPT는 키 대신 Codex 「이 컴퓨터」 줄의 「ChatGPT로 연결」.
 */
export function AiKeyAccounts({ onSaved }: { onSaved(message: string): void }) {
  const key = useAiKey()
  return (<>
    <h3 className="set-h3">{t('AI API 키', 'AI API keys')}</h3>
    <p className="set-desc">{t('Claude Code가 없어도 Gemini · Claude API 키가 있으면 논문 · 노트에 남긴 질문에 이 앱이 그 AI에게 직접 묻습니다. 어느 AI가 답할지는 ', 'Even without Claude Code, with a Gemini or Claude API key the app asks that AI directly for questions left on papers and notes. Which AI answers is chosen in ')}<a className="a" href={href({ page: 'settings', part: 'agents' })}>{t('설정 › 에이전트', 'Settings › Agents')}</a>{t('에서 고릅니다. 키는 이 컴퓨터에만 두고 끝 네 자만 보입니다.', '. Keys stay on this computer and only the last four characters are shown.')}</p>
    <div className="setup set-rows" data-ui="AI API 키">
      {key.data ? KEY_ORDER.map((p) => <KeyRow key={p} p={p} v={key.data} onSaved={onSaved} />)
        : <p className="muted setup-row">{key.error?.message ?? t('읽는 중…', 'Reading…')}</p>}
    </div>
  </>)
}

function KeyRow({ p, v, onSaved }: { p: KeyProvider; v: AiKeyView; onSaved(message: string): void }) {
  const client = useQueryClient()
  const [form, setForm] = useState(false)
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const close = () => { setForm(false); setValue(''); setErr(null) }
  const save = useMutation({
    mutationFn: () => api.saveAiKey({ provider: p, key: value.trim() }),
    onSuccess: (k) => { client.setQueryData(qk.aiKey, k); close(); onSaved(t(`${AI_NAME[p]} 키를 저장했습니다`, `Saved the ${AI_NAME[p]} key`)) },
    onError: (e: Error) => setErr(e.message),
  })
  const remove = useMutation({
    mutationFn: () => api.removeAiKey(p),
    onSuccess: (k) => { client.setQueryData(qk.aiKey, k); onSaved(t(`${AI_NAME[p]} 키를 지웠습니다`, `Removed the ${AI_NAME[p]} key`)) },
    onError: (e: Error) => setErr(e.message),
  })
  const hint = v.saved[p]
  const using = v.key?.provider === p
  const edit = t('바꾸기', 'Change')
  const del = t('지우기', 'Remove')
  return (
    <Row ok={!!hint} optional name={`${AI_NAME[p]} API`} sub={hint ? undefined : t('없음', 'None')} ui={KEY_UI[p]}
      action={hint ? <span className="setup-acts">
        <button className="icon-btn" data-tip={edit} aria-label={edit} onClick={() => setForm(true)}>{Icon.pencil}</button>
        <button className="icon-btn" data-tip={del} aria-label={del} onClick={() => remove.mutate()}>{Icon.trash}</button>
      </span> : !form && <button className="btn" data-ui="키 넣기" onClick={() => setForm(true)}>{t('＋ 키 넣기', '＋ Add key')}</button>}>
      {hint
        ? <>{t(`넣음 (끝 네 자 ${hint})`, `Added (ends in ${hint})`)}<span className="muted">{using ? t(' · 질문에 답하는 중', ' · Answering questions') : t(' · 질문에는 안 씀', ' · Not used for questions')}</span></>
        : p === 'gemini'
          ? t('구글 계정으로 Google AI Studio에 들어가 「API 키 만들기」로 받습니다. 무료로 쓸 수 있는 양이 있습니다.', 'Sign in to Google AI Studio with a Google account and use "Create API key". There is a free allowance.')
          : t('Anthropic 콘솔에서 크레딧을 넣고 API 키를 만듭니다. Claude 구독(Pro · Max)과는 따로 냅니다.', 'Add credits in the Anthropic Console and create an API key. It is billed separately from a Claude subscription (Pro · Max).')}
      {form && <span className="ai-key-form" data-ui="AI 키 넣기">
        <a className="a" href={KEY_PAGE[p]} target="_blank" rel="noreferrer">{t('키 만드는 곳', 'Get a key')}</a>
        <input className="input" type="password" autoFocus placeholder={p === 'gemini' ? 'AIza…' : 'sk-ant-…'} aria-label={t(`${AI_NAME[p]} API 키`, `${AI_NAME[p]} API key`)} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
        <span className="g-actions">
          <button className="btn primary" disabled={save.isPending || value.trim().length < 8} onClick={() => save.mutate()}>{t('저장', 'Save')}</button>
          <button className="btn" onClick={close}>{t('취소', 'Cancel')}</button>
        </span>
      </span>}
      {err && <span className="error-text"> {err}</span>}
    </Row>
  )
}

/**
 * 설정 › 에이전트 › 질문에 답할 AI (11/20 사용자 "옮기자": 설정은 계정에 등록된 것 가운데 고르기만):
 * 이 컴퓨터의 Claude(claude 명령) · Codex(ChatGPT로 로그인했을 때) · Gemini · Claude API(키를 넣었을 때) 중 하나.
 * 연결하기 · 키 넣기는 계정 페이지로 간다.
 */
export function AiPickRow({ onSaved }: { onSaved(message: string): void }) {
  const client = useQueryClient()
  const key = useAiKey()
  const codex = useQuery({ queryKey: qk.codex, queryFn: api.codexStatus })
  const [err, setErr] = useState<string | null>(null)
  const pick = useMutation({
    mutationFn: (p: Provider | null) => api.useAi(p),
    onSuccess: (k) => { setErr(null); client.setQueryData(qk.aiKey, k); onSaved(t(`질문에 ${k.key ? AI_NAME[k.key.provider] : t('이 컴퓨터의 Claude', 'Claude on this computer')}가 답합니다`, `${k.key ? AI_NAME[k.key.provider] : 'Claude on this computer'} now answers questions`)) },
    onError: (e: Error) => setErr(e.message),
  })
  const v = key.data
  const chatgpt: Provider[] = codex.data?.installed && codex.data.login ? ['chatgpt'] : []
  const choices: Provider[] = [...chatgpt, ...KEY_ORDER.filter((p) => v?.saved[p])]
  const options: (Provider | null)[] = [null, ...choices]
  const now = v?.key?.provider ?? null
  const link = <a className="a nowrap" data-ui="계정에서 연결" href={href({ page: 'account' })}>{t('계정에서 연결 ›', 'Connect on Account ›')}</a>
  return (
    <Row ok={!!now} optional name={t('질문에 답할 AI', 'AI for questions')} ui="질문에 답할 AI"
      sub={now ? <span className="ag-name"><AgentLogo agent={AI_LOGO[now]} />{now === 'chatgpt' ? t('Codex · ChatGPT 계정', 'Codex · ChatGPT account') : `${AI_NAME[now]} · ${v?.key?.model}`}</span> : t('이 컴퓨터의 Claude', 'Claude on this computer')}>
      {!v ? (key.error?.message ?? t('읽는 중…', 'Reading…'))
        : choices.length === 0
          ? <>{t('논문 · 노트에 남긴 질문에 이 컴퓨터의 Claude가 답합니다. Claude Code가 없으면 ChatGPT 계정이나 Gemini · Claude API 키를 연결하세요. ', 'Claude on this computer answers questions left on papers and notes. Without Claude Code, connect a ChatGPT account or a Gemini or Claude API key. ')}{link}</>
          : <span className="g-fields">
            <span className="segmented small" role="radiogroup" data-ui="고르기">
              {options.map((p) => (
                <button key={p ?? 'here'} role="radio" aria-checked={now === p} className={now === p ? 'on' : ''} disabled={pick.isPending} onClick={() => { if (now !== p) pick.mutate(p) }}>
                  {p ? <AiName p={p} /> : <span className="ag-name"><AgentLogo agent="claude-code" />{t('이 컴퓨터의 Claude', 'Claude on this computer')}</span>}
                </button>
              ))}
            </span>
            <span className="muted">{t('논문 · 노트에 남긴 질문에 고른 AI가 답하고, 그 계정의 사용량이 듭니다. ', 'The chosen AI answers questions left on papers and notes, using that account\'s usage. ')}{link}</span>
          </span>}
      {err && <span className="error-text"> {err}</span>}
    </Row>
  )
}
