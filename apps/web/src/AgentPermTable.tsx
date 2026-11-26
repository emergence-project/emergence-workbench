// 이 대화의 권한 표 (AgentChats.tsx의 세부 패널에서 나눔)
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { autoOf, type ChatAutoValues } from '@rw/core'
import { agentChatsApi, type Chat, type ChatSettings } from './api'
import { t } from './i18n'
import { qk } from './queries'

type PermRow = { ui: string; name: string; what: string; turn?: keyof ChatAutoValues | 'edit'; asks?: boolean }
/** 권한 표 (10/28 사용자 결정 "권한을 명령 대신 하는 일로", 시안 4절): 앱이 명령을 하는 일로 나누고, 켠 것은 묻지 않는다 */
const PERM_ROWS: PermRow[] = [
  { ui: '읽기', name: t('읽기', 'Read'), what: t('ls · cat · grep · git log (프로젝트와 등록한 폴더 안)', 'ls · cat · grep · git log (inside the project and registered folders)'), turn: 'read' },
  { ui: '편집', name: t('편집', 'Edit'), what: t('범위 안 노트 수정 · sed -i · mv', 'Edit notes in scope · sed -i · mv'), turn: 'edit' },
  { ui: '지우기', name: t('삭제', 'Delete'), what: t('rm · 파일 삭제 · 고친 것 버리기', 'rm · deleting files · discarding changes'), asks: true },
  { ui: '실행', name: t('실행', 'Run'), what: t('python · julia · pnpm test …', 'python · julia · pnpm test …'), turn: 'run' },
  { ui: '웹 보기', name: t('웹 보기', 'Web'), what: t('웹 검색 · 페이지 읽기 · gh 로 읽기(pr view · list …)', 'Web search · reading pages · reading with gh (pr view · list …)'), turn: 'web' },
  { ui: '외부', name: t('외부', 'Outside'), what: t('폴더 밖 · git push · gh 로 쓰기 · 설치 · 내려받기', 'Outside the folders · git push · writing with gh · installs · downloads'), asks: true },
]

export function PermTable({ chat, onSaved }: { chat: Chat; onSaved(m: string): void }) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const auto = autoOf(chat)
  const readOnly = chat.write === 'read'
  const set = async (row: PermRow, on: boolean) => {
    setBusy(true)
    try {
      const body: ChatSettings = row.turn === 'edit'
        ? { write: 'notes', mode: on ? 'edit' : 'ask', auto }
        : { auto: { ...auto, [row.turn!]: on } }
      client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.settings(chat.id, body))
      if (['running', 'waiting', 'queued'].includes(chat.state) && row.turn === 'edit') onSaved(t('다음 차례부터 바뀝니다', 'Applies from the next turn'))
    } catch (e) { onSaved(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="ac-perm" role="table" aria-label={t('권한', 'Permissions')}>
      <div className="ac-perm-row ac-perm-head" role="row"><span role="columnheader">{t('하는 일', 'Does')}</span><span role="columnheader">{t('자동 허용', 'Auto')}</span></div>
      {PERM_ROWS.map((r) => {
        const on = r.turn === 'edit' ? (chat.mode === 'edit' || chat.mode === 'auto') && !readOnly : r.turn ? auto[r.turn] : false
        const blocked = readOnly && (r.turn === 'edit' || r.ui === '삭제')
        return (
          <div key={r.ui} className="ac-perm-row" role="row" data-ui={`권한 ${r.ui}`}>
            <span className="ac-perm-what" role="cell"><b>{r.name}</b><span className="muted">{r.what}</span></span>
            <span role="cell" className="ac-perm-ctl">
              {blocked ? <span className="muted">{t('막음', 'Blocked')}</span>
                : r.asks ? <span className="muted">{t('늘 물음', 'Always asks')}</span>
                : <button type="button" role="switch" className="switch" aria-checked={on} aria-label={r.name} disabled={busy} onClick={() => void set(r, !on)} />}
            </span>
          </div>
        )
      })}
      {chat.mode === 'plan' && !readOnly && <span className="muted ac-hint">{t('계획: 승인하기 전에는 편집 · 삭제를 막습니다', 'Plan: edits and deletes are blocked until you approve the plan')}</span>}
    </div>
  )
}
