import { useEffect, useRef, useState, type ReactNode } from 'react'
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

export interface Defs { commands: string[]; environments: string[] }
export type { Inspection } from './api'
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
