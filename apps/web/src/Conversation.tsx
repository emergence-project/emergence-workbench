import type { ReactNode } from 'react'
import { onListKey } from './listInput'

/**
 * 주고받은 기록의 글 하나와 아래 입력란 (10/14): 피드백 화면과 고침 검토의 바뀐 곳에서 묻기가 함께 쓴다.
 * 글은 머리(이름 · 태그 · 시각) 아래 본문. 상대 글은 왼쪽, 내 글(me)은 오른쪽에 붙고 반대쪽을 비워 좌우가 갈린다.
 * 스타일은 styles/feedback.css의 .fbp-say · .fbp-compose (피드백 화면에서 먼저 만든 부품).
 */
export function SayCard({ me, name, tag, afterTag, when, end, ui, children }: {
  me: boolean; name: ReactNode; tag?: ReactNode; afterTag?: ReactNode; when?: ReactNode; end?: ReactNode; ui: string; children?: ReactNode
}) {
  return (
    <li className={`fbp-say${me ? ' me' : ''}`} data-ui={ui}>
      <div className="fbp-say-head">
        <b>{name}</b>
        {tag && <span className="tag">{tag}</span>}
        {afterTag}
        <span className="sp" />
        {when && <span className="muted fbp-say-when">{when}</span>}
        {end}
      </div>
      {children}
    </li>
  )
}

/** 입력란: 글과 오른쪽 아래 버튼들. waiting이 있으면(상대 차례) 입력란 대신 그 한 줄만 */
export function ComposeBox({ value, onChange, placeholder, error, waiting, children }: {
  value: string; onChange(v: string): void; placeholder: string; error?: string | null; waiting?: string; children: ReactNode
}) {
  if (waiting) return <div className="fbp-compose" data-ui="코멘트 입력란"><span className="muted">{waiting}</span></div>
  return (
    <div className="fbp-compose" data-ui="코멘트 입력란">
      <textarea rows={2} value={value} placeholder={placeholder} aria-label={placeholder}
        onChange={(ev) => onChange(ev.target.value)} onKeyDown={(ev) => onListKey(ev, onChange)} />
      <div className="fbp-compose-row" data-ui="승인·반려">
        {error && <span className="error-text">{error}</span>}
        <span className="sp" />
        {children}
      </div>
    </div>
  )
}
