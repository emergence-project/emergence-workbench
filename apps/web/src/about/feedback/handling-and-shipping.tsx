import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › feedback › 처리와 반영. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '처리와 반영', prs: [237, 238, 243, 244],
  items: [
    { text: <>처리 기록은 {c('feedback/status.yaml')} 한 곳에 남깁니다: 교정한 문장, 이해한 요구, 원인, 처리, 커밋.</> },
    { text: <>에이전트가 고친 것을 PR로 올리고, 검사(형 검사·테스트·빌드·화면 그림)가 통과하면 직접 합칩니다. 사용자는 설정 › 앱 기본정보의 업데이트만 누릅니다.</> },
    { text: <>앱 저장소가 있는 맥에서는 에이전트 차례인 항목을 펼치면 머리 줄 오른쪽(접기 앞)에 「에이전트에게 맡기기」가 있습니다(10/28). 누르면 그 피드백을 맡은 앱 고치기 대화가 열려 따로 둔 작업 폴더에서 고치고 시험한 뒤 PR을 엽니다. 대화의 첫 지시에는 피드백 글 · 짚은 부위 · 남길 때 그림이 붙어 갑니다. 처리 기록은 그 대화가 앱을 거쳐 적고, 고친 화면이면 CI가 찍은 그림을 남길 때 그림과 함께 전 · 후로 붙입니다. 맡긴 뒤에는 항목 글 아래 줄에 맡긴 시각, 대화 상태, PR, 「대화 보기」가 보이고, 일하는 중이면 멈출 수 있습니다. 여러 항목을 함께 맡길 수 있고(동시에 셋까지 돌고 나머지는 줄을 섬), 같은 항목은 한 대화만 맡습니다. 언제 맡기고 언제 합칠지는 설정 › 에이전트 › 앱 피드백에서 정하고, 합친 것이 도는 앱에 들어오면 상단바에 「#n 반영됨」이 뜹니다. 여러 컴퓨터에서 저절로 맡기기를 켜 두면 먼저 맡은 컴퓨터만 맡고, 다른 컴퓨터는 그 항목을 건너뜁니다(맡은 컴퓨터를 개인 저장소에 적어 올립니다).</> },
    { text: <>승인된 항목은 이 소개의 설명으로 옮기고, 원문과 처리 기록은 지웁니다. 그래서 피드백 화면에는 아직 끝나지 않은 것만 남습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Handling and shipping',
  items: [
    { text: <>The handling record is kept in one place, {c('feedback/status.yaml')}: the corrected sentence, the understood request, the cause, the handling, and the commit.</> },
    { text: <>The agent puts its fix up as a PR and merges it itself once the checks (type check, tests, build, screenshots) pass. You only press Update in Settings › About this app.</> },
    { text: <>On a Mac with the app repository, an expanded item that is the agent's turn has Hand to agent at the right of its header row, before collapse (10/28). It opens an app conversation for that feedback, which fixes and tests it in a separate work folder and opens a PR. Its first message carries the feedback text, the spot you pointed at and the picture left with it. That conversation writes the handling record through the app, and for a screen fix it attaches the picture CI took as the after picture next to the one left with the feedback as the before picture. Once handed off, a line under the item text shows when it was handed off, the conversation state, the PR and Open conversation, and you can stop it while it works. Several items can be handed off together (three run at once, the rest wait), and one item goes to only one conversation. Settings › Agents › App feedback decides when to hand off and when to merge, and once the merge is in the running app the top bar shows "#n shipped". With automatic hand-off on several computers, only the computer that claims an item first takes it and the others skip it (the claiming computer is written to your personal repository).</> },
    { text: <>Approved items move into this About page as descriptions, and their originals and handling records are deleted. So the Feedback screen keeps only what is not finished.</> },
  ],
}
