import type { BlockStatus } from '@rw/core'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BlockRow } from './api'
import { statusLabel, statusOf } from './format'
import { t } from './i18n'

export function Dialog({ title, ui, children, onClose, footer, wide }: {
  title: string; children: ReactNode; footer: ReactNode; onClose(): void; wide?: boolean
  /** 피드백 모드에서 보이는 부위 이름. 제목이 길 때만 따로 준다 */
  ui?: string
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-ui={`${ui ?? title} 창`}>
        <div className="dialog-head" data-ui="제목">{title}</div>
        {children != null && children !== false && <div className="dialog-body">{children}</div>}
        <div className="dialog-foot" data-ui="아래 버튼">{footer}</div>
      </div>
    </div>
  )
}

type Relation = 'none' | 'parent' | 'alternative'

/** 새 블록: 제목과, 어디서 갈라졌는지 또는 어떤 시도의 다른 시도인지 */
export function NewBlockDialog({ blocks, from, onClose, onCreate }: {
  blocks: BlockRow[]
  /** 지금 보고 있는 블록 (기본 연결 대상) */
  from?: string
  onClose(): void
  onCreate(input: { title: string; parent?: string; alternativeOf?: string }): Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [relation, setRelation] = useState<Relation>(from ? 'parent' : 'none')
  const [target, setTarget] = useState(from ?? blocks[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const submit = async () => {
    if (!title.trim()) return setError(t('제목을 적어 주세요.', 'Enter a title.'))
    setBusy(true)
    try {
      const alt = blocks.find((b) => b.id === target)
      await onCreate({
        title: title.trim(),
        parent: relation === 'parent' ? target : relation === 'alternative' ? alt?.parent : undefined,
        alternativeOf: relation === 'alternative' ? target : undefined,
      })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('새 노트', 'New note')} ui="새 노트" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy} onClick={() => void submit()}>{t('만들기', 'Create')}</button>
    </>}>
      <label className="field"><span>{t('제목', 'Title')}</span>
        <input ref={input} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} placeholder={t('예: Kempe 사슬 이용', 'Example: Use Kempe chains')} />
      </label>
      {blocks.length > 0 && <>
        <div className="radio-row" data-ui="관계 고르기" role="radiogroup" aria-label={t('다른 노트와의 관계', 'Relation to other notes')}>
          <label><input type="radio" checked={relation === 'none'} onChange={() => setRelation('none')} /> {t('새 뿌리', 'New root')}</label>
          <label><input type="radio" checked={relation === 'parent'} onChange={() => setRelation('parent')} /> {t('이 노트에 기대어 이어감', 'Continues from a note')}</label>
          <label><input type="radio" checked={relation === 'alternative'} onChange={() => setRelation('alternative')} /> {t('같은 것을 다른 방법으로', 'Same goal, another method')}</label>
        </div>
        {relation !== 'none' && (
          <label className="field"><span>{relation === 'parent' ? t('기대는 노트', 'Depends on') : t('같은 것을 푸는 노트', 'Note solving the same thing')}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {blocks.map((b) => <option key={b.id} value={b.id}>{b.title ?? b.id} · {statusLabel(statusOf(b.status))}</option>)}
            </select>
          </label>
        )}
      </>}
      <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{t('파일은 workbench/blocks/ 아래에 자동으로 만들어집니다. 상태는 “진행”으로 시작합니다.', 'The file is created under workbench/blocks/. Its status starts as “In progress”.')}</p>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}

/** 막힘·중지로 바꿀 때 이유를 받는다 */
export function StatusDialog({ block, to, onClose, onSubmit }: {
  block: BlockRow
  to: Extract<BlockStatus, 'blocked' | 'stopped'>
  onClose(): void
  onSubmit(fields: Record<string, string>): Promise<void>
}) {
  const [reason, setReason] = useState(to === 'blocked' ? block.blockedReason ?? '' : block.stoppedReason ?? '')
  const [resume, setResume] = useState(block.resumeCondition ?? '')
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!reason.trim() || (to === 'blocked' && !resume.trim())) return setError(to === 'blocked' ? t('멈춘 이유와 다시 시작할 조건을 모두 적어 주세요.', 'Enter both why it is blocked and when to restart.') : t('정지 이유를 적어 주세요.', 'Enter why it was dropped.'))
    try {
      await onSubmit(to === 'blocked'
        ? { status: 'blocked', 'blocked-reason': reason.trim(), 'resume-condition': resume.trim() }
        : { status: 'stopped', 'stopped-reason': reason.trim() })
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <Dialog ui="상태 바꾸기" title={t(`${statusLabel(to)}으로 바꾸기 — “${block.title ?? block.id}”`, `Change to ${statusLabel(to)}: “${block.title ?? block.id}”`)} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" onClick={() => void submit()}>{t(`${statusLabel(to)}으로 바꾸기`, `Change to ${statusLabel(to)}`)}</button>
    </>}>
      <label className="field"><span>{to === 'blocked' ? t('멈춘 이유 — 무엇을 기다리나, 어디서 막혔나', 'Why it is blocked: what are you waiting for, where are you stuck') : t('정지 이유', 'Why it was dropped')}</span>
        <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {to === 'blocked' && (
        <label className="field"><span>{t('다시 시작할 조건 — 무엇이 있으면 다시 열 수 있나', 'When to restart: what would let you reopen it')}</span>
          <textarea value={resume} onChange={(e) => setResume(e.target.value)} />
        </label>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{t('바꾸면 오늘 일지에 자동으로 기록됩니다.', "The change is recorded in today's journal.")}</p>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}

export interface Defs { commands: string[]; environments: string[] }
export interface Inspection {
  path: string; isGitRepo: boolean; hasWorkbench: boolean; suggestedTitle: string
  repoPreambles: string[]; repoPreambleDetails: Record<string, Defs>; warnings: string[]; errors: string[]
}
export interface LibraryPreamble extends Defs { name: string; file: string; title: string; description: string; place: 'first' | 'last'; status?: string }

type PickRow =
  | { kind: 'lib'; key: string; p: LibraryPreamble }
  | { kind: 'repo'; key: string; file: string; defs: Defs }

/** 정의된 기호·환경을 코드 칩으로. 많으면 앞의 몇 개와 나머지 수 */
function DefChips({ defs, shadowed }: { defs: Defs; shadowed?: Set<string> }) {
  const MAX = 6
  const items = [...defs.commands.map((c) => ({ key: c, label: c })), ...defs.environments.map((e) => ({ key: `env:${e}`, label: t(`${e} 환경`, `${e} environment`) }))]
  if (items.length === 0) return null
  return (
    <span className="pick-chips">
      {items.slice(0, MAX).map(({ key, label }) => shadowed?.has(key)
        ? <code key={key} className="cmd-chip shadowed" title={t('이 저장소 서식에 같은 이름이 있어 그쪽이 쓰입니다', "This repository's template has the same name, so that one is used")}>{label}</code>
        : <code key={key} className="cmd-chip">{label}</code>)}
      {items.length > MAX && <span className="muted">{t(`외 ${items.length - MAX}개`, `+${items.length - MAX} more`)}</span>}
    </span>
  )
}

/**
 * 새 workbench 서식에서 불러올 파일 고르기.
 * 불러오는 순서(라이브러리 기본 → 이 저장소 → 라이브러리 기호·환경) 그대로 번호를 붙여 보여 주고,
 * 결과 preamble.tex를 미리 볼 수 있다.
 */
export function PreamblePicker({ library, repo, libPicked, repoPicked, onToggleLib, onToggleRepo }: {
  library: LibraryPreamble[]
  repo: Array<{ file: string } & Defs>
  libPicked: string[]
  repoPicked: string[]
  onToggleLib(name: string): void
  onToggleRepo(file: string): void
}) {
  const [preview, setPreview] = useState(false)
  const rows: PickRow[] = [
    ...library.filter((p) => p.place === 'first').map((p) => ({ kind: 'lib' as const, key: p.name, p })),
    ...repo.map((r) => ({ kind: 'repo' as const, key: r.file, file: r.file, defs: r })),
    ...library.filter((p) => p.place === 'last').map((p) => ({ kind: 'lib' as const, key: p.name, p })),
  ]
  const on = (r: PickRow) => (r.kind === 'lib' ? libPicked.includes(r.p.name) : repoPicked.includes(r.file))
  // 고른 저장소 서식이 정의하는 이름: 뒤쪽 라이브러리 서식의 같은 이름은 쓰이지 않는다
  const repoDefined = new Set(repo.filter((r) => repoPicked.includes(r.file)).flatMap((r) => [...r.commands, ...r.environments.map((e) => `env:${e}`)]))
  let n = 0
  const lines = rows.filter(on).map((r) => `\\input{${r.kind === 'lib' ? r.p.file : `../${r.file}`}}`)

  return (
    <div className="field" data-ui="서식 고르기">
      <span>{t('서식 — 노트를 컴파일할 때 불러올 파일', 'Templates: files loaded when compiling a note')}</span>
      {rows.length === 0
        ? <div className="notes warn">{t('고를 서식이 없어 기본 서식(한글 글꼴·수식 패키지)을 씁니다. 공유 라이브러리가 설정되지 않았습니다.', 'No templates to choose from, so the default template (Korean fonts and math packages) is used. The shared library is not set up.')}</div>
        : (
          <div className="pick-list" role="group" aria-label={t('불러올 서식', 'Templates to load')}>
            {rows.map((r) => {
              const checked = on(r)
              const num = checked ? ++n : null
              return (
                <label key={r.key} className={`pick-row${checked ? '' : ' off'}`} data-ui="서식 줄" data-ui-item={r.kind === 'lib' ? r.p.title : r.file}>
                  <span className="pick-num" aria-hidden>{num ?? '–'}</span>
                  <input type="checkbox" checked={checked} onChange={() => (r.kind === 'lib' ? onToggleLib(r.p.name) : onToggleRepo(r.file))} />
                  <span className="pick-body">
                    <span className="pick-title">
                      {r.kind === 'lib' ? r.p.title : <span className="mono">{r.file}</span>}
                      {r.kind === 'lib' && r.p.status && <span className="soon">{r.p.status}</span>}
                    </span>
                    <span className="pick-desc">{r.kind === 'lib' ? r.p.description : t('이 프로젝트 전용 기호 — 같은 이름이면 라이브러리보다 우선', 'Macros for this project only. They take priority over the library for the same name')}</span>
                    <DefChips defs={r.kind === 'lib' ? r.p : r.defs} shadowed={r.kind === 'lib' && r.p.place === 'last' ? repoDefined : undefined} />
                  </span>
                  <span className={`src-tag ${r.kind}`}>{r.kind === 'lib' ? t('라이브러리', 'Library') : t('이 저장소', 'This repository')}</span>
                </label>
              )
            })}
          </div>
        )}
      <div className="pick-foot" data-ui="설명·미리보기">
        <span className="muted">{t('번호 순서대로 불러옵니다. ', 'Loaded in numbered order. ')}<s>{t('취소선', 'Struck-through')}</s>{t('은 같은 이름이 이 저장소 서식에 있어 그쪽이 쓰이는 것입니다.', " items have the same name in this repository's template, so that one is used.")}</span>
        <button type="button" className="a" onClick={() => setPreview((v) => !v)}>{preview ? t('미리보기 닫기', 'Close preview') : t('만들어질 preamble.tex 보기', 'Preview preamble.tex')}</button>
      </div>
      {preview && (
        <pre className="pick-preview">{lines.length ? lines.join('\n') : '% 고른 것이 없어 기본 서식을 씁니다'}{'\n'}% 이 프로젝트에서만 쓰는 기호는 아래에 적는다.</pre>
      )}
    </div>
  )
}
