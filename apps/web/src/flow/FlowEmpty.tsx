import { t as tr } from '../i18n'
import type { TopicRef } from './data'

/**
 * 점이 하나도 없을 때의 흐름 상자 (10/30 16:48 "흐름점이 없어도 창은 있어야 하는 거 아니야?").
 * 상자와 주제 줄은 점이 있을 때와 같은 자리에 두고, 안내는 상자 안에 적는다.
 */
export function FlowEmpty({ topics, hint }: { topics: TopicRef[]; hint: string }) {
  const rows = topics.length ? topics : [{ id: '', title: tr('주제 없음', 'No topic') }]
  return (
    <div className="fl-box fl-empty" data-ui="흐름 차트">
      {rows.map((x) => <div key={x.id} className="fl-empty-row"><span className="fl-empty-topic" title={x.title}>{x.title}</span></div>)}
      <p className="fl-empty-hint muted">{hint}</p>
    </div>
  )
}
