import { useState } from 'react'
import { type FeedbackItem } from './api'
import { PictureGallery, type GalleryPicture } from './PictureGallery'
import { Decide, MockupThread, MockupThumbs, groupMockups, mockupUrl, threadCount } from './FeedbackMockups'
import { ApproveButton, Compose, answerable } from './FeedbackAnswer'
import { latestReply } from './feedbackThread'
import { t } from './i18n'

/**
 * 피드백의 그림 크게 보기 하나 (11/23 피드백 "전후 그림과 시안 보기를 한 창으로, 거기서 대화를 이어 가게"):
 * 전 · 후 그림과 시안 어느 작은 그림을 눌러도 같은 창이 뜨고, 위 줄에서 전 · 후 · 시안을 고르거나 ← →로 넘긴다.
 * 오른쪽에는 늘 그 항목의 대화, 그 아래 답 칸: 전 · 후면 그 항목의 입력란(글 앞에 「후 그림:」), 시안이면 「논의」 · 「이 시안으로 진행」.
 * 지난 처리(고친 이력 · 대화 글)의 그림은 대화만 보이고 답 칸은 없다. 대화 칸은 위 줄 단추로 접는다(PictureGallery fold)
 */
type Shown = GalleryPicture & { kind: 'before' | 'after' | 'mockup' }

const picUrl = mockupUrl

function beforeAfter(pictures?: string[]): Shown[] {
  return (pictures ?? []).slice(0, 2).map((p, k) => ({
    kind: k ? 'after' : 'before',
    src: picUrl(p),
    label: k ? t('후', 'After') : t('전', 'Before'),
    tab: k ? t('후', 'After') : t('전', 'Before'),
    alt: k ? t('고친 뒤 화면', 'Screen after the fix') : t('수정 전 화면', 'Screen before the fix'),
  }))
}

function mockupPictures(paths?: string[]): Shown[] {
  return groupMockups(paths ?? []).filter((m) => m.pic).map((m) => ({
    kind: 'mockup', src: picUrl(m.pic ?? ''), label: `${t('시안', 'Mockup')} · ${m.name}`, tab: `${t('시안', 'Mockup')} · ${m.name}`, alt: m.name, ...(m.html && { html: picUrl(m.html) }),
  }))
}

/** 크게 본 창: live면 답 칸까지 (지금 처리의 그림), 아니면 대화만 */
function Viewer({ e, shown, start, live, onClose }: { e: FeedbackItem; shown: Shown[]; start: number; live: boolean; onClose(): void }) {
  const side = (p: GalleryPicture) => {
    const s = shown.find((x) => x.src === p.src)
    const prefix = s?.kind === 'mockup' ? `${t('시안', 'Mockup')} ${p.alt}:` : s?.kind === 'after' ? t('후 그림:', 'After picture:') : t('전 그림:', 'Before picture:')
    return (
      <div key={p.src} className="fbp-viewer-side" data-ui="크게 보기 대화">
        <MockupThread e={e} />
        {live && (s?.kind === 'mockup' && answerable(e)
          ? <Decide e={e} name={p.alt} />
          : <><ApproveButton e={e} /><Compose e={e} prefix={prefix} /></>)}
      </div>
    )
  }
  return <PictureGallery pictures={shown} start={start} onClose={onClose} foot={side} fold={{ count: threadCount(e) }} />
}

/** 한 처리의 전후 그림 [전, 후] 작은 그림 */
function BeforeAfterThumbs({ shown, onOpen }: { shown: Shown[]; onOpen(k: number): void }) {
  if (!shown.length) return null
  return (
    <div className="fbp-pictures" data-ui="전후 그림">
      {shown.map((g, k) => (
        <figure key={g.src}>
          <button type="button" className="fbp-picture" data-tip={t('크게 보기', 'View larger')} aria-label={`${t('크게 보기', 'View larger')}: ${g.alt}`} onClick={() => onOpen(k)}><img src={g.src} alt={g.alt} /></button>
          <figcaption className="muted">{g.label}</figcaption>
        </figure>
      ))}
    </div>
  )
}

/**
 * 지금 처리의 전후 그림 (10/13 진행)과 지금 처리 · 그 뒤 답에 붙은 시안 (11/19): 모두 한 창으로 넘겨 보고 거기서 답한다
 */
export function HandlingPictures({ e }: { e: FeedbackItem }) {
  const [big, setBig] = useState<number | null>(null)
  const ba = beforeAfter(e.status?.pictures)
  const paths = e.status && [...(e.status.mockups ?? []), ...(latestReply(e.status)?.mockups ?? [])]
  const shown = [...ba, ...mockupPictures(paths)]
  return (
    <>
      <BeforeAfterThumbs shown={ba} onOpen={setBig} />
      <MockupThumbs ms={groupMockups(paths ?? [])} onOpen={(k) => setBig(ba.length + k)} />
      {big !== null && <Viewer e={e} shown={shown} start={big} live onClose={() => setBig(null)} />}
    </>
  )
}

/** 고친 이력의 전후 그림: 크게 보면 대화만 (그 처리는 지나서 답하지 않는다) */
export function BeforeAfter({ e, pictures }: { e: FeedbackItem; pictures?: string[] }) {
  const [big, setBig] = useState<number | null>(null)
  const shown = beforeAfter(pictures)
  return (
    <>
      <BeforeAfterThumbs shown={shown} onOpen={setBig} />
      {big !== null && <Viewer e={e} shown={shown} start={big} live={false} onClose={() => setBig(null)} />}
    </>
  )
}

/** 대화 글에 붙은 시안: 크게 보면 대화만. 답은 지금 처리 카드의 시안에서 */
export function FeedbackMockups({ e, paths }: { e: FeedbackItem; paths?: string[] }) {
  const [big, setBig] = useState<number | null>(null)
  const shown = mockupPictures(paths)
  return (
    <>
      <MockupThumbs ms={groupMockups(paths ?? [])} onOpen={setBig} />
      {big !== null && <Viewer e={e} shown={shown} start={big} live={false} onClose={() => setBig(null)} />}
    </>
  )
}
