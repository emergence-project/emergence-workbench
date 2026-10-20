import { useState } from 'react'
import type { PersonView } from '../api'
import { fieldIndex } from '../fields'
import { useFields } from '../FieldTags'
import { t } from '../i18n'
import { PersonCard } from './PersonCard'
import { byStarThenName, useMe, usePeople } from './people'
import { Suggestions } from './Suggestions'

type GroupBy = '모두' | '기관별' | '분야별'
const GROUP_KEY = 'rw-network-group'
const GROUPS: GroupBy[] = ['모두', '기관별', '분야별']
/** 묶기 버튼의 화면 이름 (GroupBy는 저장 값) */
const GROUP_LABEL: Record<GroupBy, string> = { 모두: t('모두', 'All'), 기관별: t('기관별', 'By institution'), 분야별: t('분야별', 'By field') }

/**
 * 네트워킹 첫 화면 (10/4 14:46, 16:19 피드백): "사람들" 한 칸.
 * 맨 위에 나(노트 저자는 내 페이지에서, 10/4 20:49), 그 아래 사람 카드(즐겨찾기 → 가나다순, 기관별·분야별로 묶어 볼 수 있다), 등록 추천.
 */
export function Authors({ onSaved }: { onSaved(m: string): void }) {
  const { data: people } = usePeople()
  const me = useMe(people)
  const fields = useFields()
  const [by, setBy] = useState<GroupBy>(() => { try { const v = localStorage.getItem(GROUP_KEY) as GroupBy | null; return v && GROUPS.includes(v) ? v : '모두' } catch { return '모두' } })
  /** 분야별에서 고른 분야 하나 (없으면 모든 분야) */
  const [field, setField] = useState<string | null>(null)
  const pick = (g: GroupBy) => { setBy(g); setField(null); try { localStorage.setItem(GROUP_KEY, g) } catch { /* 기억 못 해도 된다 */ } }

  const others = (people ?? []).filter((p) => p.id !== me?.id).sort(byStarThenName)
  const groups = new Map<string, PersonView[]>()
  for (const p of others) {
    const keys = by === '모두' ? ['모두'] : by === '기관별' ? p.orgs : p.tags
    for (const k of keys.length ? keys : ['']) groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const restTitle = by === '기관별' ? t('소속을 모름', 'Unknown affiliation') : t('분야 태그 없음', 'No field tag')
  // 분야별은 분야 차례(분류 순서)를 따라 늘어놓는다. 기관별은 사람이 많은 순
  const index = by === '분야별' ? fieldIndex(new Map([...groups.entries()].filter(([k]) => k).map(([k, v]) => [k, v.length])), fields ?? []) : []
  const named = by === '분야별'
    ? index.flatMap((r) => r.fields.map((f) => [f.name, groups.get(f.name)!, r.root ? [r.root, f.rest].filter(Boolean).join(' › ') : ''] as const))
    : [...groups.entries()].filter(([k]) => k).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([k, v]) => [k, v, ''] as const)
  const rest = groups.get('')
  const shown = [...named, ...(rest ? [[restTitle, rest, ''] as const] : [])].filter(([k]) => !field || k === field)

  const card = (p: PersonView, isMe = false) => <PersonCard key={p.id} p={p} people={people!} isMe={isMe} />

  return (
    <>
      <header>
        <p className="h-sub" data-ui="부제">{t('함께 연구하는 사람들입니다. 사람을 고르면 소속·연구 분야·저자 정보와 노트 참고 문헌에 있는 그 사람의 논문이 보입니다.', 'People you work with. Pick someone to see their affiliation, field, author info and their papers in your note references.')}</p>
      </header>
      {/* 나는 사람들 칸 위에 따로 (10/4 16:52). 노트 저자는 내 페이지 안에서만 (10/4 20:49 "내 프로필 내부로 옮기자") */}
      {me && (
        <section className="net-me" data-ui="나">
          <div className="net-cards">{card(me, true)}</div>
        </section>
      )}
      <section data-ui="사람 카드">
        <div className="sec-head">
          <h2>{t('사람들', 'People')}</h2><span className="count">{people ? others.length : ''}</span><span className="sp" />
          <div className="segmented small" role="radiogroup" aria-label={t('그룹', 'Group by')} data-ui="묶기">
            {GROUPS.map((g) => <button key={g} role="radio" aria-checked={by === g} className={by === g ? 'on' : ''} onClick={() => pick(g)}>{GROUP_LABEL[g]}</button>)}
          </div>
        </div>
        {!people ? <p className="muted">{t('불러오는 중…', 'Loading…')}</p> : (
          <>
            {/* 10/4 19:20 "분야별로 볼 때 분야 탐색은?": 개념노트 분류의 맨 위 단계별로 분야 차례를 두고, 하나를 고르면 그 분야 사람만 */}
            {by === '분야별' && index.length > 0 && (
              <nav className="net-field-index" data-ui="분야 차례" aria-label={t('분야 차례', 'Fields')}>
                <button className={`net-field${!field ? ' on' : ''}`} onClick={() => setField(null)}>{t('모든 분야', 'All fields')} <span className="muted">{others.length}</span></button>
                {index.map((r) => (
                  <div key={r.root || '-'} className="net-field-row">
                    <span className="net-field-root muted">{r.root || t('목록에 없음', 'Not in list')}</span>
                    {r.fields.map((f) => (
                      <button key={f.name} className={`net-field${field === f.name ? ' on' : ''}`} title={r.root ? [r.root, f.rest].join(' › ') : t('개념노트 분류 목록에 없는 태그', 'Tag not in the concept note subject list')} onClick={() => setField(field === f.name ? null : f.name)}>
                        {/* 10/4 20:51 반려 "경로 전체가 있어 난잡해": 마지막 단계 이름만, 전체 경로는 가리키면 */}{f.name} <span className="muted">{f.count}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            )}
            {shown.map(([k, list, path]) => (
              <div key={k} className="net-group">
                {by !== '모두' && <h3 className="net-group-h" title={path || undefined}>{k} <span className="muted">{list.length}</span></h3>}
                <div className="net-cards">{list.map((p) => card(p))}</div>
              </div>
            ))}
            {by === '분야별' && !named.length && <p className="muted">{t('사람 페이지에서 "주 연구 분야"를 적으면 여기서 분야별로 묶입니다.', 'Add "Main research field" on a person page to group them by field here.')}</p>}
          </>
        )}
        {people && <Suggestions people={people} onSaved={onSaved} />}
      </section>
    </>
  )
}
