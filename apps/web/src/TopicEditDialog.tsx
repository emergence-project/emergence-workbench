import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ConflictError, LIMITS, notesApi, TOPIC_COLORS, type Topic, type TopicColor, type TopicPatch, type TopicStats } from './api'
import { charCount } from './cardParts'
import { CardEditDialog } from './CardEditDialog'
import { CardImageField, CardImagePicker } from './CardImagePicker'
import { onListKey } from './listInput'
import { noteKindLabel } from './noteKinds'
import { TopicCardView } from './TopicCardView'
import { t } from './i18n'

/** 바탕색 이름 (고르기 단추의 이름표) */
const COLOR_LABEL: Record<TopicColor, string> = { violet: t('보라', 'Violet'), blue: t('파랑', 'Blue'), teal: t('청록', 'Teal'), orange: t('주황', 'Orange'), gray: t('회색', 'Gray') }

/**
 * 주제 고치기 창 (10/5 시안 `7-주제-고치기-창`, 다안). 주제 화면의 이름 옆 연필로 연다.
 * 왼쪽: 이름(80자) · 설명(300자, "- " 목록) · 카드 미리보기 글(30자) · 노트 성격 "자동".
 * 오른쪽: 실제 크기 주제 카드(바꾸는 대로), 그 바로 아래 그림 · 바탕색, 맨 아래 취소(Esc) · 저장(⌘↵) (10/10 고치기 창 A안). 아래 띠는 없다. 즐겨찾기는 창에 두지 않는다.
 * 저장은 research.yaml의 해시(baseHash)를 함께 보내, 바깥에서 바뀌었으면 고치지 않고 알린다. 그림은 라이브러리 참조만 저장한다.
 */
export function TopicEditDialog({ rid, topic, hash, pc, project, onClose, onSaved }: {
  rid: string
  topic: Topic & TopicStats
  /** research.yaml 해시 (읽을 때 받은 것) */
  hash: string
  /** 프로젝트 색 */
  pc: string
  project: string
  onClose(): void
  /** 저장했을 때 (알림 글) */
  onSaved(message: string): void
}) {
  const [title, setTitle] = useState(topic.title)
  const [description, setDescription] = useState(topic.description ?? '')
  const [text, setText] = useState(topic.preview?.text ?? '')
  const [color, setColor] = useState<TopicColor | 'default'>(topic.preview?.color ?? 'default')
  const [image, setImage] = useState(topic.preview?.image ?? '')
  const [pickingImage, setPickingImage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { nameInput.current?.focus() }, [])

  const api = useMemo(() => notesApi(rid), [rid])
  const oldImage = topic.preview?.image ? api.topicImageUrl(topic.id, hash) : undefined
  const imageUrl = image ? oldImage : undefined

  const n = { title: charCount(title), description: charCount(description), text: charCount(text) }
  // 이미 넘친 글은 고치지 않으면 막지 않는다 (서버와 같은 규칙)
  const over = (n.title > LIMITS.title && title !== topic.title) || (n.description > LIMITS.cardDescription && description !== (topic.description ?? ''))
    || (n.text > LIMITS.previewText && text !== (topic.preview?.text ?? ''))
  const canSave = !busy && !!title.trim() && !over

  const saving = useRef(false)
  const save = async () => {
    if (!canSave || saving.current) return
    saving.current = true
    setBusy(true); setError(null)
    const patch: TopicPatch = {
      title: title.trim(), description,
      preview: { text: text.trim() || null, color, ...(image !== (topic.preview?.image ?? '') && { image: image || null }) },
    }
    try {
      await api.patchTopic(topic.id, patch, hash)
      onSaved(t(`주제 "${title.trim()}"를 고쳤습니다`, `Edited topic "${title.trim()}"`))
    } catch (e) {
      saving.current = false
      setBusy(false)
      setError(e instanceof ConflictError ? t('다른 곳에서 research.yaml이 바뀌어 저장하지 않았습니다. 창을 닫고 다시 열어 고쳐 주세요.', 'research.yaml changed elsewhere, so nothing was saved. Close the dialog, open it again, and edit.') : (e as Error).message)
    }
  }
  const swatch = (c: TopicColor | 'default') => (
    <button key={c} type="button" className={`td-sw ${c === 'default' ? 'c-default' : `c-${c}`}${color === c ? ' on' : ''}`} role="radio" aria-checked={color === c}
      aria-label={c === 'default' ? t('바탕색: 기본 (프로젝트 색)', 'Color: Default (project color)') : `${t('바탕색', 'Color')}: ${COLOR_LABEL[c]}`} title={c === 'default' ? t('기본 (프로젝트 색)', 'Default (project color)') : COLOR_LABEL[c]}
      style={{ ['--pc' as string]: pc } as CSSProperties} onClick={() => setColor(c)} />
  )

  return (<>
    <CardEditDialog title={t('주제 고치기', 'Edit topic')} location={`${project} › ${topic.title}`} pc={pc} ui="주제 고치기 창"
      canSave={canSave} onClose={onClose} onSave={() => void save()} preview={
        <TopicCardView ui="주제 카드 미리보기" pc={pc} data={{
          title: title.trim(), description, star: topic.star, kinds: topic.kinds, byStatus: topic.byStatus, updated: topic.updated,
          preview: { text, image, imageUrl, ...(color !== 'default' && { color }) },
        }} />
      } lower={<>
        <div className="td-row">
          <span className="td-rl">{t('카드 미리보기', 'Card preview')}</span>
          <span className="td-in td-pv-in">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('비어 있음', 'Empty')} aria-label={t('카드 미리보기 글', 'Card preview text')} data-ui="카드 미리보기 글" />
            <span className={`td-n${n.text > LIMITS.previewText ? ' over' : ''}`}>{n.text} / {LIMITS.previewText}</span>
          </span>
        </div>
        <div className="td-row">
          <span className="td-rl">{t('노트 성격', 'Note kinds')} <span className="td-auto" title={t('노트들의 성격을 모아 보일 뿐 여기서 고칠 수 없습니다. 노트의 오른쪽 사이드바에서 고릅니다', "This only collects the notes' kinds and cannot be edited here. Choose a kind in the note's right sidebar")}>{t('자동', 'Auto')}</span></span>
          <span className="td-kinds">
            {topic.kinds.length ? topic.kinds.map((k) => <span key={k.kind ?? '-'} className={`kc-kind${k.kind ? '' : ' un'}`}>{noteKindLabel(k.kind)}</span>)
              : <span className="muted">{t('노트가 없습니다', 'No notes')}</span>}
          </span>
        </div>
      </>} look={<>
        <div className="td-row">
          <span className="td-rl">{t('그림', 'Image')}</span>
          <CardImageField value={image} legacyUrl={imageUrl} ui="그림 넣기" previewUi="미리보기 그림" disabled={busy} onOpen={() => setPickingImage(true)} onChange={setImage} />
        </div>
        <div className="td-row">
          <span className="td-rl">{t('바탕색', 'Color')}</span>
          <span className="td-sws" role="radiogroup" aria-label={t('바탕색', 'Color')}>{(['default', ...TOPIC_COLORS] as const).map(swatch)}</span>
        </div>
      </>}>
      <label className="td-f">
        <span className="td-lab"><span>{t('이름', 'Name')}</span><span className={`td-n${n.title > LIMITS.title ? ' over' : ''}`}>{n.title} / {LIMITS.title}</span></span>
        <input ref={nameInput} className="td-in" value={title} onChange={(e) => setTitle(e.target.value)} data-ui="주제 이름" />
      </label>
      <label className="td-f grow">
        <span className="td-lab"><span>{t('설명', 'Description')}</span><span className={`td-n${n.description > LIMITS.cardDescription ? ' over' : ''}`}>{n.description} / {LIMITS.cardDescription}</span></span>
        <textarea className="td-in td-ta" rows={4} value={description} placeholder={t('예: 두 상태를 합치는 보조정리\n- 줄 앞에 "- "를 쓰면 글머리표 목록\n카드에는 앞 세 줄이 보입니다', 'Example: A lemma that merges two states\n- Start a line with "- " for a bulleted list\nThe card shows the first three lines')}
          onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => { onListKey(e, setDescription) }} data-ui="주제 설명" />
      </label>
      {error && <p className="td-err" role="alert">{error}</p>}
    </CardEditDialog>
    {pickingImage && <CardImagePicker rid={rid} project={project} pc={pc} value={image} onChange={setImage} onClose={() => setPickingImage(false)} />}
  </>)
}
