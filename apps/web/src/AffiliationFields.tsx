import { useState } from 'react'
import { affiliationSuggestions } from './affiliationSuggest'
import { t } from './i18n'

/** 제안에서 적은 글자와 맞는 곳을 굵게 */
function marked(name: string, query: string) {
  const q = query.trim()
  const k = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1
  return k < 0 ? name : <>{name.slice(0, k)}<b>{name.slice(k, k + q.length)}</b>{name.slice(k + q.length)}</>
}

/**
 * 사람 고치기 창의 소속 (10/18 시안 5절): 한 줄에 한 칸, 첫 칸이 주소속. 적는 대로 다른 사람 · 원고 저자에게 적은 소속을 아래에 제안한다.
 * ↑↓로 고르고 Enter로 넣는다. 목록에 없는 소속은 그대로 적으면 된다. 빈 칸은 저장할 때 빠진다.
 */
export function AffiliationFields({ value, known, disabled, onChange }: { value: string[]; known: string[]; disabled?: boolean; onChange(next: string[]): void }) {
  const [focus, setFocus] = useState<number | null>(null)
  const [at, setAt] = useState(0)
  const [closed, setClosed] = useState(false)
  const rows = value.length ? value : ['']
  const set = (i: number, text: string) => onChange(rows.map((r, k) => (k === i ? text : r)))
  const offers = focus === null || closed ? [] : affiliationSuggestions(rows[focus] ?? '', known, rows.filter((_, k) => k !== focus))
  const choose = (i: number, name: string) => { set(i, name); setClosed(true) }
  return (
    <div className="td-f pe-affs" data-ui="소속 칸">
      <span className="td-lab"><span>{t('소속', 'Affiliation')}</span><span className="td-n">{t('첫 칸이 주소속', 'First is main')}</span></span>
      {rows.map((r, i) => (
        <div key={i} className="pe-aff">
          <input className="td-in" value={r} disabled={disabled} aria-label={i === 0 ? t('주소속', 'Main affiliation') : t(`소속 ${i + 1}`, `Affiliation ${i + 1}`)}
            role="combobox" aria-expanded={focus === i && offers.length > 0} aria-autocomplete="list"
            onFocus={() => { setFocus(i); setAt(0); setClosed(false) }} onBlur={() => setFocus((f) => (f === i ? null : f))}
            onChange={(e) => { set(i, e.target.value); setAt(0); setClosed(false) }}
            onKeyDown={(e) => {
              if (focus !== i || !offers.length || e.nativeEvent.isComposing) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(at + 1, offers.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(at - 1, 0)) }
              else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); choose(i, offers[at]!) }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setClosed(true) }
            }} />
          {focus === i && offers.length > 0 && (
            <div className="menu pe-ac" role="listbox" aria-label={t('다른 사람 · 원고 저자에게 적은 소속', 'Affiliations given to other people and manuscript authors')}>
              {offers.map((name, k) => (
                <button key={name} type="button" role="option" aria-selected={k === at} className={k === at ? 'on' : ''} tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); choose(i, name) }} onMouseEnter={() => setAt(k)}>{marked(name, rows[i] ?? '')}</button>
              ))}
              <div className="pe-ac-h">{t('다른 사람 · 원고 저자에게 적은 소속', 'Given to other people and manuscript authors')}</div>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="a pe-add" disabled={disabled || !rows[rows.length - 1]?.trim()} onClick={() => onChange([...rows, ''])}>{t('＋ 소속 추가', '＋ Add affiliation')}</button>
    </div>
  )
}
