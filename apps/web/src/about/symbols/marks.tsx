import type { AboutSection } from '../types'

// 소개 › symbols › 기록 표시. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = { title: '기록 표시', id: 'marks', prs: [103, 118, 120, 142, 158, 166, 175], items: [{ text: <>누르지 않는 표시입니다. 글자 대신 다른 아이콘과 같은 선 그림입니다.</> }] }

export const en: AboutSection = { title: 'Record marks', id: 'marks', items: [{ text: <>Marks you do not press. They are line drawings like the other icons, not text characters.</> }] }
