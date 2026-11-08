import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { t } from './i18n'
import { qk } from './queries'
import { AI_NAME } from './AiKeySettings'

/** 설정 › 에이전트에서 고른 AI(ChatGPT · Gemini · Claude 키)가, 없으면 이 컴퓨터의 Claude가 답한다 (11/8, aiKey.ts) */
export function AskButton({ asking, onAsk }: { asking: boolean; onAsk(): void }) {
  const key = useQuery({ queryKey: qk.aiKey, queryFn: api.aiKey, staleTime: 60_000 })
  const ai = key.data ? AI_NAME[key.data.provider] : 'Claude'
  const where = key.data ? t(`${ai}가 PDF·노트를 읽고 답을 아래에 덧붙입니다 (1분쯤 걸릴 수 있음)`, `${ai} reads the PDF or note and adds an answer below (may take a minute)`)
    : t('이 컴퓨터의 Claude가 PDF를 읽고 답을 아래에 덧붙입니다 (몇 분 걸릴 수 있음)', 'Claude on this computer reads the PDF and adds an answer below (may take a few minutes)')
  return <button className="btn ghost sm cmt-ask" disabled={asking} title={where} onClick={onAsk}>{asking ? t(`${ai}가 답을 쓰는 중…`, `${ai} is writing an answer…`) : t(`${ai}에게 묻기`, `Ask ${ai}`)}</button>
}
