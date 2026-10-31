import { useState } from 'react'
import { AgentPage, AgentSide, NewChat } from '../AgentChats'
import { t } from '../i18n'
import { usePhone } from '../phoneLayout'
import { go } from '../router'
import { Sheet } from './Sheet'

/**
 * 폰의 대화 탭 (10/31 폰 시안 https://claude.ai/artifact/M7D5NatDAN9agDCJTmPpop ④, 3단계): 메신저처럼 첫 화면이 대화 목록이고,
 * 줄을 누르면 맥과 같은 대화 화면(말풍선 · 카드 · 입력란)이 열린다. 새 대화는 아래에서 올라오는 시트에서 쓴다.
 * 맥 폭에서는 예전 그대로(사이드바 목록 + 본문 새 대화).
 */
export function AgentScreen({ id, onSaved }: { id?: string; onSaved(m: string): void }) {
  return usePhone() && !id ? <PhoneChats /> : <AgentPage id={id} onSaved={onSaved} />
}

function PhoneChats() {
  const [writing, setWriting] = useState(false)
  return (
    <main className="stage full ph-turns ph-chats" data-ui="폰 대화 목록">
      <div className="ph-head"><h1>{t('대화', 'Chats')}</h1><span className="sp" />
        <button className="btn primary" data-ui="폰 새 대화" onClick={() => setWriting(true)}>{t('＋ 새 대화', '＋ New chat')}</button></div>
      <AgentSide />
      {writing && <Sheet head={t('새 대화', 'New conversation')} onClose={() => setWriting(false)}>
        <NewChat onCreated={(c) => { setWriting(false); go({ page: 'agent', id: c.id }) }} />
      </Sheet>}
    </main>
  )
}
