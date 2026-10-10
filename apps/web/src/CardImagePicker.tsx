import { parseCardFigureRef } from '@rw/core'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { figuresApi, LIBRARY_SCOPE } from './api'
import { CardImage } from './CardImage'
import { cardImageFigures, cardImageFileError } from './cardImagePickerData'
import { isDialogHostDisplayed } from './dialogVisibility'
import { forgetFigures, useFigureListState } from './figureEmbed'
import { FigurePreview } from './FigurePreview'
import { t, plural } from './i18n'

/** 고치기 창의 값은 부모가 보관한다. 여기서는 고르기와 빼기로 초안만 바꾼다. */
export function CardImageField({ value, legacyUrl, ui, previewUi = ui, disabled, onOpen, onChange }: {
  value: string
  legacyUrl?: string
  ui: string
  previewUi?: string
  disabled?: boolean
  onOpen(): void
  onChange(value: string): void
}) {
  const { data } = useFigureListState()
  const ref = parseCardFigureRef(value)
  const name = data?.figures.find((f) => f.id === ref?.id)?.name ?? value.split('/').pop()
  return value ? <span className="cip-field on" data-ui={previewUi}>
    <button type="button" className="cip-picked" disabled={disabled} onClick={onOpen} aria-label={t(`그림 고르기 — ${name}`, `Choose figure: ${name}`)} title={name}>
      <span className="cip-thumb"><CardImage image={value} legacyUrl={legacyUrl} /></span>
      <span className="cip-name">{name}</span>
    </button>
    <button type="button" className="icon-btn" disabled={disabled} aria-label={t('그림 빼기', 'Remove figure')} title={t('그림 빼기', 'Remove figure')} onClick={() => onChange('')}>×</button>
  </span> : <button type="button" className="td-pick" data-ui={ui} disabled={disabled} onClick={onOpen}>{t('＋ 그림 더하기', '＋ Add figure')}</button>
}

/** 부모 고치기 창과 나란히 두어 탭을 숨겨도 찾는 글과 초안을 보존한다. */
export function CardImagePicker({ rid, project, pc, value, onChange, onClose }: {
  rid: string
  project: string
  pc: string
  value: string
  onChange(value: string): void
  onClose(): void
}) {
  const host = useRef<HTMLSpanElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const opener = useRef(document.activeElement)
  const input = useRef<HTMLInputElement>(null)
  const live = useRef(true)
  const uploading = useRef(false)
  const [displayed, setDisplayed] = useState(false)
  const [source, setSource] = useState<'library' | 'computer'>('library')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(6)
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { data, error } = useFigureListState()
  const rows = cardImageFigures(data?.figures ?? [], rid, query)

  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 숨긴 탭이 다시 보일 때를 잡으려고 렌더마다 잰다 (같은 값이면 다시 그리지 않는다)
  useLayoutEffect(() => { setDisplayed(isDialogHostDisplayed(host.current)) })
  useLayoutEffect(() => {
    const sentinel = host.current
    if (!sentinel) return
    const refresh = () => setDisplayed(isDialogHostDisplayed(sentinel))
    const observer = new ResizeObserver(refresh)
    observer.observe(sentinel)
    let frame = 0
    const route = () => { refresh(); cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh) }
    window.addEventListener('hashchange', route)
    return () => { observer.disconnect(); window.removeEventListener('hashchange', route); cancelAnimationFrame(frame) }
  }, [])
  useEffect(() => {
    if (!displayed) return
    const previous = opener.current
    const first = dialog.current?.querySelector<HTMLElement>('input:not([hidden])') ?? dialog.current?.querySelector<HTMLElement>('button:enabled')
    first?.focus()
    return () => { if (previous instanceof HTMLElement && isDialogHostDisplayed(previous)) previous.focus() }
  }, [displayed])

  const close = () => { if (!uploading.current) onClose() }
  const choose = (next: string) => { onChange(next); onClose() }
  const add = async (files: File[]) => {
    if (uploading.current) return
    const invalid = cardImageFileError(files)
    if (invalid) { setUploadError(invalid); return }
    uploading.current = true; setBusy(true); setUploadError(null)
    try {
      const added = await figuresApi.upload(files[0]!, rid)
      forgetFigures()
      if (live.current) choose(`figure:${added.id}`)
    } catch (e) { if (live.current) setUploadError((e as Error).message) }
    finally { uploading.current = false; if (live.current) setBusy(false) }
  }
  const drop = (e: DragEvent) => {
    e.preventDefault(); setHover(false)
    void add([...e.dataTransfer.files])
  }

  return <>
    <span ref={host} className="td-host" aria-hidden="true" />
    {displayed && createPortal(
      <div className="overlay cip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
        <div ref={dialog} className="dialog cip-dialog" role="dialog" aria-modal="true" aria-label={t('카드 그림 고르기', 'Choose card figure')} data-ui="카드 그림 고르기" aria-busy={busy}
          onKeyDown={(e) => {
            if (!isDialogHostDisplayed(host.current) || e.nativeEvent.isComposing) return
            e.stopPropagation()
            if (e.key === 'Escape') { e.preventDefault(); close() }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.preventDefault()
            if (e.key === 'Tab') {
              const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:enabled, input:enabled:not([hidden])') ?? [])].filter((el) => el.getClientRects().length)
              const first = controls[0], last = controls[controls.length - 1]
              if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
            }
          }}>
          <div className="td-head">
            <span className="td-band" style={{ ['--pc' as string]: pc } as CSSProperties} aria-hidden />
            <div className="td-titles"><b>{t('카드 그림 고르기', 'Choose card figure')}</b><span>{project}</span></div>
            <button type="button" className="icon-btn td-x" aria-label={t('닫기', 'Close')} title={t('닫기 (Esc)', 'Close (Esc)')} disabled={busy} onClick={close}>×</button>
          </div>
          <div className="cip-body">
            <div className="segmented" role="radiogroup" aria-label={t('그림을 가져올 곳', 'Figure source')} data-ui="그림 가져올 곳">
              <button type="button" className={source === 'library' ? 'on' : ''} role="radio" aria-checked={source === 'library'} disabled={busy} onClick={() => setSource('library')}>{t('그림 라이브러리', 'Figure library')}</button>
              <button type="button" className={source === 'computer' ? 'on' : ''} role="radio" aria-checked={source === 'computer'} disabled={busy} onClick={() => setSource('computer')}>{t('이 컴퓨터', 'This computer')}</button>
            </div>
            {source === 'library' ? <>
              <input className="td-in cip-search" type="search" aria-label={t('그림 찾기', 'Search figures')} placeholder={t('이름 · 파일 이름 · 설명으로 찾기', 'Search by name · file name · description')} data-ui="카드 그림 찾기" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(6) }} />
              <p className="cip-help">{t('이 프로젝트 · 공용 그림', 'This project · shared figures')}{query ? '' : t(' · 최근 순', ' · most recent first')}</p>
              {error && <p className="td-err" role="alert">{t('그림 목록을 읽지 못했습니다: ', 'Could not read the figure list: ')}{error} <button type="button" className="btn sm" onClick={forgetFigures}>{t('다시 읽기', 'Reload')}</button></p>}
              {!data && !error && <p className="cip-help" role="status">{t('그림을 읽는 중…', 'Loading figures…')}</p>}
              {data && !rows.length && <p className="cip-help">{query ? t('맞는 그림이 없습니다.', 'No matching figures.') : t('아직 그림이 없습니다. 이 컴퓨터에서 그림을 골라 주세요.', 'No figures yet. Choose one from this computer.')}</p>}
              <div className="cip-grid">
                {rows.slice(0, limit).map((fig) => <button type="button" key={fig.id} className={`fg-card${value === `figure:${fig.id}` ? ' on' : ''}`} aria-pressed={value === `figure:${fig.id}`} title={fig.name} data-ui="카드 그림 항목" data-ui-item={fig.name} onClick={() => choose(`figure:${fig.id}`)}>
                  <FigurePreview fig={fig} />
                  <span className="fg-card-name">{fig.name}</span>
                  <span className="fg-card-meta"><span className="fg-kind mono">{fig.kind}</span><span>{fig.scope === LIBRARY_SCOPE ? t('공용', 'Shared') : t('이 프로젝트', 'This project')}</span></span>
                </button>)}
              </div>
              {rows.length > limit && <button type="button" className="btn" onClick={() => setLimit((n) => n + 6)}>{t(`그림 ${rows.length - limit}개 더 보기`, `Show ${plural(rows.length - limit, 'more figure')}`)}</button>}
            </> : <>
              <div className={`cip-drop${hover ? ' on' : ''}`} data-ui="카드 그림 파일 고르기" onDrop={drop}
                onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); if (!busy) setHover(true) } }} onDragLeave={() => setHover(false)}>
                <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{t('＋ 파일 고르기', '＋ Choose file')}</button>
                <span>{busy ? t('그림을 올리는 중…', 'Uploading figure…') : t('그림 파일 하나를 끌어다 놓으세요.', 'Drop one figure file here.')}</span>
                <span className="cip-help">{t('SVG · PNG · JPG · PDF · PDF는 첫 쪽을 씁니다.', 'SVG · PNG · JPG · PDF · PDFs use the first page.')}</span>
                <input ref={input} type="file" accept="image/*,.svg,.pdf" hidden disabled={busy} onChange={(e) => { if (e.target.files?.length) void add([...e.target.files]); e.target.value = '' }} />
              </div>
              <p className="cip-help">{t('이 프로젝트의 그림 라이브러리에 둡니다. 고치기를 취소해도 올린 그림은 남습니다.', 'Saved to this project\'s figure library. Uploaded figures stay even if you cancel editing.')}</p>
              {uploadError && <p className="td-err" role="alert">{uploadError}</p>}
            </>}
          </div>
          {value && <div className="dialog-foot"><button type="button" className="btn" disabled={busy} onClick={() => choose('')}>{t('× 그림 빼기', '× Remove figure')}</button></div>}
        </div>
      </div>, document.body,
    )}
  </>
}
