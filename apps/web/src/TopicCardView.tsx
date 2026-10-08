import type { BlockStatus } from '@rw/core'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { NoteCategory, TopicColor } from './api'
import { CardImage } from './CardImage'
import { CardDescription, CardStar, cardTime, MathText, TagLine } from './cardParts'
import { statusLabel } from './format'
import { noteKindLabel } from './noteKinds'
import { t } from './i18n'

/**
 * 주제 카드 (10/5 시안 "주제 카드", 세로 3:4). 위쪽 미리보기(글 · `$…$` 수식 · 그림, 비우면 프로젝트 색),
 * 제목과 ☆ · 설명 앞 세 줄 · 노트들이 가진 성격(자동, 미분류 포함) · 상태별 노트 수 · 최근 시각.
 * 주제 화면의 주제 고치기 창 미리보기와 프로젝트 첫 화면의 "주제" 섹션이 같이 쓴다.
 */
export interface TopicCardData {
  title: string
  description?: string
  preview?: { text?: string; image?: string; imageUrl?: string; color?: TopicColor }
  kinds: { kind: NoteCategory | null; count: number }[]
  byStatus: Partial<Record<BlockStatus, number>>
  updated?: number
  star: boolean
}

/** 상태별 수를 보이는 순서 (색 점 + 수) */
const COUNT_ORDER: BlockStatus[] = ['in-progress', 'blocked', 'solved', 'stopped']

/** 미리보기 칸: 그림은 가운데, 글과 함께면 그림 위 · 글 아래. 바탕은 고른 색, 없으면 프로젝트 색 */
export function TopicPreviewFace({ preview, pc }: { preview?: TopicCardData['preview']; pc: string }) {
  const text = preview?.text?.trim()
  const img = preview?.image || preview?.imageUrl
  return (
    <div className={`kc-pv ${preview?.color ? `c-${preview.color}` : 'c-default'}${img ? ' has-img' : ''}${img && text ? ' both' : ''}`} style={{ ['--pc' as string]: pc } as CSSProperties} data-ui="카드 미리보기">
      {img && <CardImage image={preview?.image} legacyUrl={preview?.imageUrl} />}
      {text && <span className="kc-pv-text"><MathText text={text} /></span>}
    </div>
  )
}

export function TopicCardView({ data, pc, onOpen, onStar, ui = '주제 카드' }: {
  data: TopicCardData
  /** 프로젝트 색 (미리보기 기본 바탕) */
  pc: string
  onOpen?(): void
  onStar?(): void
  ui?: string
}) {
  const open = onOpen ? {
    role: 'link', tabIndex: 0, onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } },
  } : {}
  const kinds = data.kinds.map((k) => ({ key: k.kind ?? '-', label: noteKindLabel(k.kind), cls: `kc-kind${k.kind ? '' : ' un'}` }))
  return (
    <div className={`kc topic${onOpen ? ' link' : ''}`} data-ui={ui} data-ui-item={data.title} {...open}>
      <TopicPreviewFace preview={data.preview} pc={pc} />
      <div className="kc-in">
        <div className="kc-top">
          <div className="kc-head"><b className="kc-title">{data.title || t('이름 없음', 'Untitled')}</b><CardStar on={data.star} onToggle={onStar} name={data.title} /></div>
          <CardDescription text={data.description} lines={3} />
        </div>
        <TagLine tags={kinds} className="kc-kinds" />
        <div className="kc-foot">
          <span className="kc-counts">
            {COUNT_ORDER.filter((s) => (data.byStatus[s] ?? 0) > 0).map((s) => (
              <span key={s} className="kc-count" title={`${statusLabel(s)} ${data.byStatus[s]}`}><span className={`g ${s}`} role="img" aria-label={statusLabel(s)} />{data.byStatus[s]}</span>
            ))}
          </span>
          <span className="kc-time">{cardTime(data.updated)}</span>
        </div>
      </div>
    </div>
  )
}
