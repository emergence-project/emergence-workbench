import { useEffect, useRef, useState } from 'react'
import { conceptsApi } from './api'
import { fieldOptions, matchFields, type FieldOption } from './fields'
import { t } from './i18n'

/** 개념노트 분류에서 만든 분야 목록 (사람의 주 연구 분야 · 프로젝트 분야는 여기서만 고른다) */
export function useFields(): FieldOption[] | null {
  const [fields, setFields] = useState<FieldOption[] | null>(null)
  useEffect(() => { conceptsApi.subjects({}).then((s) => setFields(fieldOptions(s))).catch(() => setFields([])) }, [])
  return fields
}

/**
 * 분야 이름표 (10/4 대화): 개념노트 분류와 같은 목록(fields.ts)에서만 골라 하나씩 더하고, ×로 뺀다.
 * 사람의 주 연구 분야와 프로젝트 분야(10/5 시안 "프로젝트 성격 · 분야")가 함께 쓴다.
 * 첫째가 카드 맨 앞에 온다. 목록에 없는 예전 이름표는 "목록에 없음"으로 보이고 빼기만 된다.
 * 10/4 18:53 "전체를 펼쳐버리면 찾기가 너무 힘들어": ＋를 누르면 찾는 칸이 열리고, 적은 글자가 든 분야만 보인다.
 * 빈 칸일 때는 자주 붙인 분야(used) 몇 개만.
 */
export function FieldTags({ tags, used, tagClassName = 'tag', onChange }: { tags: string[]; used: Map<string, number>; tagClassName?: string; onChange(tags: string[], message: string): void }) {
  const fields = useFields()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const known = new Set((fields ?? []).map((f) => f.name.toLowerCase()))
  const offer = (fields ?? []).filter((f) => !tags.some((tag) => tag.toLowerCase() === f.name.toLowerCase()))
  const matches = matchFields(q, offer, used)
  const choose = (f: FieldOption) => { onChange([...tags, f.name], t(`분야 "${f.name}"을 더했습니다`, `Added field "${f.name}"`)); setQ(''); setAt(0); setOpen(false); trigger.current?.focus() }
  return (
    <div className="net-tags tag-edit" data-ui="분야 이름표">
      {tags.map((tag) => (
        <span key={tag} className={`${tagClassName} tag-x`} title={fields && !known.has(tag.toLowerCase()) ? t('개념노트 분류 목록에 없는 태그입니다', 'This tag is not in the concept note subject list') : undefined}>
          {tag}{fields && !known.has(tag.toLowerCase()) && <span className="muted">{t(' · 목록에 없음', ' · not in list')}</span>}
          <button className="icon-btn" aria-label={t(`${tag} 빼기`, `Remove ${tag}`)} title={t('빼기', 'Remove')} onClick={() => onChange(tags.filter((x) => x !== tag), t(`분야 "${tag}"을 뺐습니다`, `Removed field "${tag}"`))}>×</button>
        </span>
      ))}
      {!tags.length && <span className="muted">{t('없음', 'None')}</span>}
      {fields && fields.length > 0 && (
        <div className="net-pick" ref={box}>
          <button ref={trigger} className="a" aria-expanded={open} onClick={() => { setOpen(!open); setQ(''); setAt(0) }}>{t('＋ 분야 더하기', '＋ Add field')}</button>
          {open && (
            <div className="menu net-pick-menu" role="listbox">
              <input
                className="net-pick-input" autoFocus value={q} placeholder={t('분야 이름으로 찾기', 'Search fields by name')} aria-label={t('분야 찾기', 'Search fields')}
                onChange={(e) => { setQ(e.target.value); setAt(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false)
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(at + 1, matches.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(at - 1, 0)) }
                  else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && matches[at]) { e.preventDefault(); choose(matches[at]!) }
                }}
              />
              {!q && matches.length > 0 && <div className="net-pick-h muted">{t('자주 쓰는 분야', 'Frequent fields')}</div>}
              {matches.map((f, i) => (
                <button key={f.name} role="option" aria-selected={i === at} className={i === at ? 'on' : ''} onMouseEnter={() => setAt(i)} onClick={() => choose(f)}>
                  <span className="net-pick-name">{f.name}</span>
                  {f.path !== f.name && <span className="muted net-pick-path">{f.path.slice(0, -f.name.length - 3)}</span>}
                </button>
              ))}
              {q && !matches.length && <div className="net-pick-h muted">{t(`"${q}"가 든 분야가 없습니다. 분야는 개념노트 분류에서 만듭니다.`, `No field contains "${q}". Fields come from concept note subjects.`)}</div>}
            </div>
          )}
        </div>
      )}
      {fields && fields.length === 0 && <span className="muted">{t('개념노트 분류가 없어 고를 분야가 없습니다.', 'No fields to choose: there are no concept note subjects yet.')}</span>}
    </div>
  )
}
