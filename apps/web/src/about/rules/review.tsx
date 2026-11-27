import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › rules › 다시 보는 법. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs는 ko에만 적는다(조각 about/prs/<번호>.json).

export const ko: AboutSection = {
  title: '다시 보는 법', id: 'review',
  items: [
    { text: <>규칙은 늘 의심합니다(2026-11-27 사용자 결정). 모델이 나아지면 필요 없어지는 규칙이 있어서, 규칙마다 다시 볼 날을 두고 한 달에 한 번과 모델이 바뀐 주에 <code>pnpm agent:rules</code>로 봅니다.</> },
    { text: <>앱이 알리는 것은 둘입니다: 다시 볼 날이 지난 규칙, 커밋의 25% 넘게 의례 줄을 쓰게 하는 규칙. 알린 규칙은 효과가 없거나 나쁘면 에이전트가 풀자고 제안하고(판정 결정 필요), 사용자가 정합니다.</> },
    { text: <>새 규칙을 더하는 PR은 목록에도 한 줄을 더합니다: 왜 · 무엇으로 잴지 · 다시 볼 날 · 대상 · 방식. 절차는 앱 저장소의 {c('docs/rules/README.md')}에 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'How rules are reviewed', id: 'review',
  items: [
    { text: <>Rules are always doubted (user decision 2026-11-27). Some become unnecessary as models improve, so each rule has a review date, and <code>pnpm agent:rules</code> is run once a month and in any week the model changes.</> },
    { text: <>The app flags two things: rules past their review date, and rules that make over a quarter of commits write a ritual line. For a flagged rule that has no effect or does harm, an agent proposes relaxing it (verdict Needs decision) and you decide.</> },
    { text: <>A PR that adds a rule also adds a row to the list: why, how to measure it, a review date, audience and how. The procedure is in {c('docs/rules/README.md')} in the app repository.</> },
  ],
}
