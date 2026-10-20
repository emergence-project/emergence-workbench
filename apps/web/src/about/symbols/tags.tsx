import { FeedbackTagsTable } from '../../aboutFigures'
import type { AboutSection } from '../types'

// 소개 › symbols › 대화 태그. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '대화 태그', id: 'tags', prs: [94, 103, 114],
  figure: <FeedbackTagsTable />,
  items: [
    { text: <>피드백 화면에서 펼친 항목의 대화마다 머리에 붙는 태그입니다. 그 대화에 나온 태그는 대화 아래 "태그 설명" 줄에도 보이고, "태그 설명" 바로 옆의 동그라미 안 물음표를 누르면 이 표로 옵니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Conversation tags', id: 'tags',
  figure: <FeedbackTagsTable />,
  items: [
    { text: <>The tags at the head of each message in an opened item on the feedback screen. The tags used in that conversation also appear in the "Tags" line below it; the circled question mark right after "Tags" brings you to this table.</> },
  ],
}
