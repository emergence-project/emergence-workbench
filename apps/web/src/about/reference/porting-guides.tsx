import { c, portUrl } from '../code'
import type { AboutSection } from '../types'

// 소개 › reference › 다른 앱에 옮기기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.
// 안내서를 더하면 여기 GUIDES와 docs/ports/README.md 표에도 적는다 (scripts/ci/check-ports.mjs가 본다).

const GUIDES: { name: string; ko: string; en: string }[] = [
  { name: 'feedback', ko: '피드백 (남기기 · 처리 기록 · 답 · 모아 보기)', en: 'Feedback (leaving · handling record · answers · overview)' },
  { name: 'agent-chat', ko: '에이전트 대화 (차례 · 허락 · 기록 · 이어 하기)', en: 'Agent conversations (turns · permissions · record · resume)' },
  { name: 'pdf-comments', ko: 'PDF 읽기와 코멘트 (고른 자리 · 기록 파일 · 다시 찾기)', en: 'PDF reading and comments (selected spot · record file · re-finding)' },
]

const link = (port: string) => <a className="a" href={portUrl(port)} target="_blank" rel="noreferrer">{`docs/ports/${port}.md`}</a>

export const ko: AboutSection = {
  title: '다른 앱에 옮기기', id: 'ports',
  items: [
    { text: <>이 앱의 기능을 다른 앱에도 만들 때 쓰는 이식 안내서가 저장소 {c('docs/ports/')}에 있습니다(11/19). 다른 앱의 에이전트에게 "이 안내서와 관련 코드를 읽고 이 앱에도 같게 만들어 줘"라고 맡기면 됩니다. 안내서마다 무엇 · 핵심 파일 · 저장 모양 · 단계 · 점검 목록이 있고, 맨 위에 그 기능을 설명하는 소개 절과 구현 파일 목록이 있습니다.</> },
    ...GUIDES.map((g) => ({ text: <>{g.ko}: {link(g.name)}</> })),
    { text: <>소개와 안내서는 서로 가리킵니다: 위 기능의 소개 절 맨 아래에 그 안내서로 가는 줄이 있습니다. 안내서가 적은 코드를 바꾼 업데이트는 안내서와 그 소개 절도 함께 고치고, 그대로 맞으면 그 까닭을 한 줄 남깁니다. CI가 짝 · 경로 · 이 동기화를 검사합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Porting to another app', id: 'ports',
  items: [
    { text: <>Porting guides for building this app's features in another app are in the repository's {c('docs/ports/')} (11/19). Ask that app's agent to "read this guide and the code it names, and build the same here". Each guide has what it is · key files · stored shape · steps · checklist, and starts with the about sections that describe the feature and the list of files that implement it.</> },
    ...GUIDES.map((g) => ({ text: <>{g.en}: {link(g.name)}</> })),
    { text: <>The about page and the guides point at each other: the about section of each feature above ends with a line to its guide. An update that changes code a guide names also updates the guide and its about section, or leaves a one-line reason why they still hold. CI checks the pairs, the paths and this sync.</> },
  ],
}
