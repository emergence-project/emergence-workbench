import { networkApi, type PersonView } from '../api'
import { Icon } from '../icons'
import { go } from '../router'
import { t } from '../i18n'
import { StarIcon } from '../marks'
import { addedOf, announce, Avatar, subOf, withChange } from './people'

/**
 * 사람 카드 하나 (첫 화면의 사람들, 내 페이지의 노트 저자·함께 쓴 사람이 같은 카드를 쓴다: 10/4 20:53 "디자인 또 만들지 말고 카드 디자인 다시 써").
 * 오른쪽 위는 즐겨찾기 ☆, 노트 저자 목록에서는 빼기 × (가리킬 때).
 */
export function PersonCard({ p, people, isMe, sub, badge, onRemove }: { p: PersonView; people: PersonView[]; isMe?: boolean; sub?: string; badge?: string; onRemove?(): void }) {
  const toggleStar = async () => {
    try { await networkApi.savePeople(addedOf(withChange(people, p, { star: !p.star }))); announce() } catch { /* 다음에 다시 */ }
  }
  const line = sub ?? subOf(p)
  return (
    <div className="net-card-wrap">
      <button className="net-card" data-ui="사람 카드" data-ui-item={p.name} onClick={() => go({ page: 'network', person: p.id })}>
        <Avatar name={p.name} person={p} />
        <span className="net-card-body">
          <span className="net-card-name"><span className="net-card-n">{p.name}</span>{isMe && <span className="tag">{t('나', 'Me')}</span>}{badge && <span className="tag">{badge}</span>}</span>
          {line && <span className="muted net-card-sub">{line}</span>}
          {/* 10/4 19:07 "주 분야를 먼저 띄우고, 나머지 분야는 +2": 첫 이름표만, 나머지는 수로 (가리키면 이름이 뜬다) */}
          {p.tags.length > 0 && (
            <span className="net-card-tags">
              <span className="tag">{p.tags[0]}</span>
              {p.tags.length > 1 && <span className="net-more" title={p.tags.slice(1).join(' · ')} aria-label={t(`다른 분야 ${p.tags.slice(1).join(', ')}`, `Other fields: ${p.tags.slice(1).join(', ')}`)}>+{p.tags.length - 1}</span>}
            </span>
          )}
        </span>
      </button>
      {onRemove
        ? <span className="hover-actions net-card-actions"><button className="icon-btn sm" data-ui="저자에서 빼기" title={t('빼기 — 노트 저자에서만 빠지고, 네트워킹의 사람은 그대로 남습니다', 'Remove from note authors only. The person stays in Networking')} aria-label={t('노트 저자에서 빼기', 'Remove from note authors')} onClick={onRemove}>{Icon.x}</button></span>
        : !isMe && (
          <button className={`net-star${p.star ? ' on' : ''}`} data-ui="즐겨찾기" aria-pressed={p.star} title={p.star ? t('즐겨찾기 빼기', 'Remove from favorites') : t('즐겨찾기 (맨 앞에 둡니다)', 'Favorite (keeps it first)')} onClick={() => void toggleStar()}>
            <StarIcon on={p.star} />
          </button>
        )}
    </div>
  )
}
