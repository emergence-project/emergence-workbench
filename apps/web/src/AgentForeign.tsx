import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, type Chat } from './api'
import { t } from './i18n'
import { qk } from './queries'
import { go } from './router'

/**
 * 다른 컴퓨터에서 돌린 대화의 입력란 자리 (11/20 「읽기만 보이게」 + 요약으로 이어 하기, 서버 agentShare.ts):
 * 이 컴퓨터에서는 읽기만 하고, 「이 컴퓨터에서 이어 하기」가 같은 프로젝트의 새 대화를 열어 앞 대화를 첫 지시에 붙여 넘긴다.
 */
export function ForeignBar({ chat }: { chat: Chat }) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const go_ = async () => {
    setBusy(true); setFail(null)
    try {
      const c = await agentChatsApi.continueHere(chat.id)
      client.setQueryData(qk.agentChat(c.id), c)
      void client.invalidateQueries({ queryKey: qk.agentChats })
      go({ page: 'agent', id: c.id })
    } catch (e) { setFail(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="ac-compose ac-foreign" data-ui="다른 컴퓨터 대화">
      <div className="ac-foreign-text">
        <b>{t(`${chat.machine}에서 돌린 대화`, `Ran on ${chat.machine}`)}</b>
        <span className="muted">{t('이 컴퓨터에서는 읽기만 합니다. 이어 하면 이 컴퓨터에 새 대화를 열고, 앞 대화를 첫 지시에 붙여 넘깁니다.', 'Read-only on this computer. Continuing opens a new conversation here and passes the earlier conversation with your first message.')}</span>
      </div>
      <div className="ac-foreign-act"><button className="btn primary sm" data-ui="이 컴퓨터에서 이어 하기" disabled={busy} onClick={() => void go_()}>{t('이 컴퓨터에서 이어 하기', 'Continue on this computer')}</button></div>
      {fail && <div className="error-text">{fail}</div>}
    </div>
  )
}
