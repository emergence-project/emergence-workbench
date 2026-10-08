import type { KeyboardEvent } from 'react'
import type { NoteRow } from './api'
import { CardDescription, CardStar, cardTime, TagLine } from './cardParts'
import { statusLabel } from './format'
import { LOOSE_NOTES_LABEL, LOOSE_TOPIC_ID, noteKindLabel } from './noteKinds'
import { t } from './i18n'

/**
 * 노트 카드 (10/5 시안 "노트 카드", 정사각형 184px): 제목 위 작은 글씨로 성격, 제목(두 줄), 설명 앞 두 줄,
 * 이 노트가 든 모든 주제 태그 한 줄, 상태 점 · 이름과 최근 시각. 다음 할 일은 두지 않는다.
 * 멈춘 노트의 다시 열 조건은 상태에 마우스를 올리면 보인다. ☆는 제목 오른쪽 (회색).
 * 주제 화면과 프로젝트 첫 화면의 "노트" 섹션(최근 손댄 노트)이 같이 쓴다. 주제가 없는 노트는 점선 "노트들" 태그.
 */
export function NoteCardView({ row, topicTitle, onOpen, onStar }: {
  row: NoteRow
  /** 주제 id → 이름 (없는 id는 태그에서 뺀다) */
  topicTitle(id: string): string | undefined
  onOpen(): void
  onStar?(): void
}) {
  const known = row.topics.flatMap((id) => { const t = topicTitle(id); return t ? [{ key: id, label: t, cls: 'kc-chip' }] : [] })
  // 주제가 없는 노트는 점선 "노트들" 태그 (10/5 시안 2-프로젝트-첫화면)
  const tags = known.length ? known : [{ key: LOOSE_TOPIC_ID, label: LOOSE_NOTES_LABEL, cls: 'kc-chip loose' }]
  const resume = row.status === 'blocked' || row.status === 'stopped' ? row.resume : undefined
  return (
    <div className="kc note link" role="link" tabIndex={0} data-ui="노트 카드" data-ui-item={row.title} onClick={onOpen}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}>
      <div className="kc-top">
        <span className="kc-kind-eb" title={row.kindAuto ? t('폴더에서 정한 성격입니다', 'Kind set from the folder') : undefined}>{noteKindLabel(row.kind)}</span>
        <div className="kc-head"><b className="kc-title">{row.title}</b><CardStar on={row.star} onToggle={onStar} name={row.title} /></div>
        <CardDescription text={row.description} lines={2} className={row.descriptionAuto ? 'auto' : ''} />
      </div>
      <TagLine tags={tags} className="kc-topics" />
      <div className="kc-foot">
        <span className="kc-state" title={resume ? `${t('다시 열 조건', 'Reopen when')}: ${resume}` : statusLabel(row.status)}>
          <span className={`g ${row.status}`} role="img" aria-label={statusLabel(row.status)} /><span className="g-name">{statusLabel(row.status)}</span>
        </span>
        <span className="kc-time">{cardTime(row.mtime)}</span>
      </div>
    </div>
  )
}

/** 카드 줄 끝의 점선 빈 카드 (＋ 와 이름): "노트 만들기" · "주제 만들기" */
export function NewCard({ label, shape, onClick, ui }: { label: string; shape: 'note' | 'topic'; onClick(): void; ui: string }) {
  return (
    <button type="button" className={`kc-new ${shape}`} data-ui={ui} onClick={onClick}>
      <span className="kc-new-plus" aria-hidden>＋</span><span>{label}</span>
    </button>
  )
}
