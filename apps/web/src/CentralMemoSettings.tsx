// 설정 › 에이전트 › 중앙 메모 (11/16 시안 9x2Bud4dVQyYkS6RhdnbAG §6 · §9 ⑤): 사용자가 정한 오래 갈 사실("앞으로 X는 Y로").
// 중앙 대화가 새로 열릴 때와 메모가 바뀐 뒤에 읽는다. 중앙이 memo_write로 고치기도 하고, 사용자가 여기서 고친다. 개인 저장소가 있으면 거기 두어 두 맥이 함께 읽는다
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agentChatsApi } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'

/** 서버의 한도 (agentCentral.ts MEMO_MAX) */
const MEMO_MAX = 4000

export function CentralMemoSettings({ onSaved }: { onSaved(m: string): void }) {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.centralMemo, queryFn: agentChatsApi.memo })
  const [text, setText] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (v: string) => agentChatsApi.setMemo(v),
    onSuccess: (v) => { client.setQueryData(qk.centralMemo, v); setText(null); onSaved(t('중앙 메모를 저장했습니다', 'Saved the central memo')) },
  })
  const m = q.data
  return (<>
    <h3 className="set-h3">{t('중앙 메모', 'Central memo')}</h3>
    <p className="set-desc">{m?.where === 'personal'
      ? t('앞으로 지킬 규칙처럼 오래 갈 사실을 적어 둡니다. 중앙이 새 대화를 열 때 읽고, 말씀하신 규칙은 중앙이 직접 적기도 합니다. 개인 저장소에 두어 두 맥이 같은 메모를 읽습니다.', 'Lasting facts such as rules to keep from now on. Central reads it when a new conversation opens and writes rules you state. It lives in your personal repository, so both Macs read the same memo.')
      : t('앞으로 지킬 규칙처럼 오래 갈 사실을 적어 둡니다. 중앙이 새 대화를 열 때 읽고, 말씀하신 규칙은 중앙이 직접 적기도 합니다. 이 컴퓨터에만 둡니다.', 'Lasting facts such as rules to keep from now on. Central reads it when a new conversation opens and writes rules you state. It stays on this computer.')}</p>
    <div className="set-rows ac-memo" data-ui="중앙 메모">
      {!m ? <p className="muted setup-row">{q.error?.message ?? t('읽는 중…', 'Reading…')}</p>
        : text === null
          ? <div className="ac-memo-view">
            {m.text ? <p className="ac-memo-text">{m.text}</p> : <p className="muted">{t('아직 적은 것이 없습니다.', 'Nothing written yet.')}</p>}
            <button className="icon-btn" data-tip={t('메모 수정', 'Edit memo')} aria-label={t('메모 수정', 'Edit memo')} onClick={() => setText(m.text)}>{Icon.pencil}</button>
          </div>
          : <div className="ac-memo-edit">
            <textarea className="input ac-memo-input" autoFocus rows={Math.min(14, Math.max(4, text.split('\n').length + 1))} maxLength={MEMO_MAX} value={text} aria-label={t('중앙 메모', 'Central memo')} placeholder={t('예: 그림 설명은 「전」 「후」로 쓴다', 'e.g. Captions use Before and After')} onChange={(e) => setText(e.target.value)} />
            <div className="setup-acts">
              {save.error && <span className="error-text">{save.error.message}</span>}
              <button className="btn" onClick={() => setText(null)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary" disabled={save.isPending || text === m.text} onClick={() => save.mutate(text)}>{t('저장', 'Save')}</button>
            </div>
          </div>}
    </div>
  </>)
}
