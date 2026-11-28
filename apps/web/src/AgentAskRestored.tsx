import { useState } from 'react'
import type { ChatItem } from './api'
import { t } from './i18n'

type Ask = Extract<ChatItem, { kind: 'ask' }>
type Since = NonNullable<Ask['since']>

/** 바뀐 것이 없는지 (셀 수 없었으면 「바뀐 것」으로 본다) */
export const unchanged = (s: Since | undefined): boolean => !!s && !s.error && !s.files.length && !s.commits && !s.main && !s.ci

/** 바뀐 것의 수 (태그의 n) */
export const changeCount = (s: Since): number => s.files.length + (s.commits ? 1 : 0) + (s.main ? 1 : 0) + (s.ci ? 1 : 0)

const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const CI_NAME: Record<string, string> = { pending: t('도는 중', 'running'), failed: t('실패', 'failed'), passed: t('통과', 'passed') }
const ciName = (s?: string) => (s ? CI_NAME[s] ?? s : t('없음', 'none'))

/**
 * 앱이 다시 켜진 뒤에도 남은 허락 · 계획 카드의 시각 줄 (11/28 사용자 결정 "다시 켠 뒤 허락 카드"):
 * 왼쪽 「09:10 물음 · 09:14 다시 켜짐」, 오른쪽 태그 「이상 없음」(청록) 또는 「바뀐 것 n」(노랑). 노란 태그를 누르면 그 태그에서 이어진 상자가 펼쳐진다
 */
export function RestoredLine({ it }: { it: Ask }) {
  const [open, setOpen] = useState(false)
  if (!it.restored) return null
  const s = it.since
  const ok = unchanged(s)
  return (
    <div className="ac-restored-wrap">
      <div className={`ac-restored${open ? ' open' : ''}`} data-ui="다시 켠 뒤 카드 시각">
        <span className="muted">{t(`${hm(it.at)} 물음 · ${hm(it.restored.at)} 다시 켜짐`, `Asked ${hm(it.at)} · restarted ${hm(it.restored.at)}`)}</span>
        {!s ? <span className="ac-since-tag wait">{t('변경사항 세는 중…', 'Checking changes…')}</span>
          : ok ? <span className="ac-since-tag ok" data-ui="이상 없음 태그">{t('✓ 이상 없음', '✓ No changes')}</span>
            : (
              <button type="button" className={`ac-since-tag warn${open ? ' open' : ''}`} data-ui="바뀐 것 태그" aria-expanded={open} onClick={() => setOpen(!open)}>
                {s.error ? t('⚠ 변경사항 모름', '⚠ Changes unknown') : t(`⚠ 변경사항 ${changeCount(s)}`, `⚠ ${changeCount(s)} changed`)} <span aria-hidden>{open ? '▴' : '▾'}</span>
              </button>
            )}
      </div>
      {s && !ok && open && (
        <ul className="ac-since-box" data-ui="바뀐 것 상자">
          {s.error && <li>{s.error}</li>}
          {s.files.map((f) => <li key={f.file}><span className="mono">{f.file}</span> <span className="ac-add">+{f.added}</span> <span className="ac-del">−{f.removed}</span></li>)}
          {s.commits > 0 && <li>{t(`이 브랜치가 커밋 ${s.commits}개만큼 움직임`, `This branch moved by ${s.commits} commit(s)`)}</li>}
          {s.main > 0 && <li>{t(`main에 새 커밋 ${s.main}개`, `${s.main} new commit(s) on main`)}</li>}
          {s.ci && <li>{t(`CI: ${ciName(s.ci.from)} → ${ciName(s.ci.to)}`, `CI: ${ciName(s.ci.from)} → ${ciName(s.ci.to)}`)}</li>}
        </ul>
      )}
    </div>
  )
}
