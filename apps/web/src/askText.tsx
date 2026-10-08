import { useEffect, useRef, useState } from 'react'
import { Dialog } from './dialogs'
import { t } from './i18n'

/**
 * 이름·제목·짧은 글 하나를 받는 앱 모양의 작은 창. 브라우저 기본 입력창(prompt) 대신 쓴다
 * (docs/design-system.md 4절: 같은 일은 같은 모양). 취소하면 null, 아니면 적은 글(앞뒤 공백 그대로).
 */
export type AskText = {
  title: string
  /** 칸 위의 짧은 이름 (예: "제목") */
  label?: string
  initial?: string
  placeholder?: string
  /** 칸 아래 한 줄 설명 */
  hint?: string
  /** 확인 버튼 말 (기본 "확인") */
  ok?: string
  /** 여러 줄 */
  multiline?: boolean
}

/** 예·아니오 확인 (지우기·버리기). 브라우저 confirm 대신: 에이전트가 화면 창으로 다룰 수 있게 */
export type AskConfirm = {
  title: string
  /** 무엇이 남는지 한두 문장 (docs/design-system.md 4절) */
  hint?: string
  /** 확인 버튼 말 (예: "지우기") */
  ok: string
}

type Pending = (AskText & { confirm?: false; resolve(v: string | null): void })
  | (AskConfirm & { confirm: true; resolve(v: string | null): void })
let show: ((p: Pending) => void) | null = null

export function askText(opts: AskText): Promise<string | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.prompt(opts.title, opts.initial ?? ''))
    show({ ...opts, resolve })
  })
}

export function askConfirm(opts: AskConfirm): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm([opts.title, opts.hint].filter(Boolean).join(' ')))
    show({ ...opts, confirm: true, resolve: (v) => resolve(v !== null) })
  })
}

/** App에 한 번 둔다 */
export function AskTextHost() {
  const [p, setP] = useState<Pending | null>(null)
  useEffect(() => { show = setP; return () => { show = null } }, [])
  if (!p) return null
  const done = (v: string | null) => { setP(null); p.resolve(v) }
  if (p.confirm) return <ConfirmDialog key={p.title} p={p} done={done} />
  return <AskTextDialog key={p.title + (p.initial ?? '')} p={p} done={done} />
}

function ConfirmDialog({ p, done }: { p: AskConfirm; done(v: string | null): void }) {
  const ok = useRef<HTMLButtonElement>(null)
  useEffect(() => ok.current?.focus(), [])
  return (
    <Dialog ui="확인" title={p.title} onClose={() => done(null)} footer={<>
      <button className="btn" onClick={() => done(null)}>{t('취소', 'Cancel')}</button>
      <button ref={ok} className="btn primary" onClick={() => done('')}>{p.ok}</button>
    </>}>
      {p.hint && <p className="muted ask-hint">{p.hint}</p>}
    </Dialog>
  )
}

function AskTextDialog({ p, done }: { p: AskText; done(v: string | null): void }) {
  const [value, setValue] = useState(p.initial ?? '')
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (!p.multiline || e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); done(value) }
  }
  return (
    <Dialog ui="입력" title={p.title} onClose={() => done(null)} footer={<>
      <button className="btn" onClick={() => done(null)}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" onClick={() => done(value)}>{p.ok ?? t('확인', 'OK')}</button>
    </>}>
      <label className="field">{p.label && <span>{p.label}</span>}
        {p.multiline
          ? <textarea ref={input} rows={3} value={value} placeholder={p.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} />
          : <input ref={input} value={value} placeholder={p.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} />}
      </label>
      {p.hint && <p className="muted ask-hint">{p.hint}</p>}
    </Dialog>
  )
}
