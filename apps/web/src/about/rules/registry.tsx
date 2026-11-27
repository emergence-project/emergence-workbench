import { RulesTable } from '../../ResearchTables'
import type { AboutSection } from '../types'

// 소개 › rules › 규칙 목록. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs는 ko에만 적는다(조각 about/prs/<번호>.json).

export const ko: AboutSection = {
  title: '규칙 목록', id: 'registry',
  figure: <RulesTable />,
  items: [
    { text: <>규칙마다 두 갈래를 적습니다(11/27 사용자 코멘트). <b>대상</b>: 앱을 쓰는 에이전트(연구 저장소에서 일함) · 앱을 고치는 에이전트 · 둘 다. <b>방식</b>: 글(지시문으로 주고 지키기를 기대함) · 코드(앱이나 검사가 막아서 어기면 실행되지 않음) · 글과 코드.</> },
    { text: <><b>잰 것</b>은 최근 30일 커밋에서 그 규칙 때문에 쓴 줄의 비율(예: "소개: 그대로" 줄)이나 그 규칙이 지키는 파일을 고친 커밋 수입니다. 터미널의 <code>pnpm agent:rules</code>와 같은 계산입니다.</> },
    { text: <>글로만 지키는 규칙은 펼치면 <b>코드로 옮길 길</b>이 적혀 있습니다. 기계적으로 지킬 수 있는 것은 앱이 맡아, 에이전트에게는 짧고 분명한 지시만 남깁니다.</> },
    { text: <>판정이 결정 필요인 줄만 주황으로 펼쳐져 있고 「진행」 · 「그대로 두기」를 누를 수 있습니다. 누른 답은 개인 저장소의 피드백 폴더(<code>rules.yaml</code>)에 남고, 에이전트가 다음 규칙 점검에서 PR로 반영합니다. <b>안전</b> 규칙은 이 답으로만 풉니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Rule list', id: 'registry',
  figure: <RulesTable />,
  items: [
    { text: <>Each rule carries two labels (user comment 11/27). <b>Audience</b>: agents using the app (working in research repositories) · agents fixing the app · both. <b>How</b>: written (given as instructions and expected to be followed) · code (the app or a check blocks it, so breaking it does not run) · both.</> },
    { text: <><b>Measured</b> is the share of recent commits (30 days) that wrote a line because of the rule (such as an "About: unchanged" line), or the number of commits that touched the files it guards. It is the same calculation as <code>pnpm agent:rules</code> in the terminal.</> },
    { text: <>A written-only rule shows <b>a way to move it into code</b> when expanded. What can be kept mechanically is handed to the app, so agents get short, clear instructions.</> },
    { text: <>Only rows whose verdict is Needs decision are orange and open, with "Proceed" and "Leave as is". Your answer is saved in the feedback folder of your personal repository (<code>rules.yaml</code>), and an agent applies it in a PR at the next rules review. A <b>Safety</b> rule is relaxed only through this answer.</> },
  ],
}
