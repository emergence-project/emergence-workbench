import type { AboutSection } from '../types'

// 소개 › feedback › 모아 보기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '모아 보기', prs: [94, 158, 251],
  items: [
    { text: <>레일의 "피드백"(핀 + 글줄)을 누르면 모아 봅니다. 툴바 왼쪽에서 필터를 고르고, 가운데에서 시각 · 화면 · 테마 · 종류로 묶습니다. 오른쪽에는 "피드백 등록"이 있습니다(바로 GitHub에 올림). 앱 폴더가 공개 저장소를 가리키면 그 앞에 "GitHub 이슈로 보내기"도 있습니다: 지금 거른 목록에서 여럿을 골라 공개 저장소의 버그 양식 하나에 차례로 적은 이슈 초안을 새 창에 엽니다(그림은 넣지 않음, 주소가 너무 길면 앞의 것만). 피드백 창에서는 하나씩 보내지 않습니다. 시각 보기는 한 표입니다: 시각, 상태, 내용, 화면, 부위, 앱 버전, 반영 커밋. 반영 커밋 옆 "앱에 있음"은 그 고침이 지금 앱에 들어 있다는 뜻이고, "앱 업데이트 필요"는 새 버전을 받아야 들어온다는 뜻입니다(홈의 "업데이트 필요"는 연구 저장소에 받을 커밋이 있다는 뜻). 줄을 누르면 원문·이해한 요구·처리가 펼쳐집니다.</> },
    { text: <>펼친 항목의 위치 글자 자체가 그 자리로 가는 링크입니다. 갈 수 있는 화면이 있을 때만 누를 수 있고, 가리키면 밑줄과 "그 자리로 가기" 툴팁이 보입니다.</> },
    { text: <>같은 지적은 최신 항목 하나로 합쳐 "+N"으로 표시합니다. 남긴 코멘트는 가리키면 오른쪽 위에 나오는 연필·휴지통으로 고치고 지웁니다.</> },
    { text: <>"확인 필요"와 레일의 주황 수는 에이전트가 결정을 물은 항목(질의 · 동의 · 물음이 붙은 답변)과, 처리했지만 아직 승인 · 수정하지 않은 항목입니다.</> },
    { text: <>펼친 항목은 위에 처리 요약(이해한 요구 · 원인 · 처리와 그 시각, 고친 이력), 아래에 사용자와 관리자가 주고받은 대화가 있습니다. 맨 아래 버튼은 늘 셋이고 답의 종류에 따라 이름이 바뀝니다. 에이전트가 결과를 알린 답(반영 · 답변 · 거절 · 추후)에는 질문 · 수정 · 승인: 입력란이 비었으면 승인만, 글을 쓰면 질문과 수정이 켜집니다. 결정을 물은 답(질의 · 동의 · 물음이 붙은 답변)에는 질문 · 중단 · 진행: 진행하면 Claude가 그대로 하고, 중단하면 그대로 끝납니다. 글을 쓰면 함께 적힙니다. 질문은 처리를 그대로 두고 묻는 말이라 관리자가 답만 하고, 수정 · 진행하면 그 항목은 대기로 돌아가 Claude가 다시 처리합니다. 내가 쓴 글은 오른쪽 위 연필로 고치고, 마지막 답은 "되돌리기"로 무를 수 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Overview',
  items: [
    { text: <>Click "Feedback" on the rail (pin with text lines) to see it all. Choose a filter at the left of the toolbar, and group by time · screen · theme · kind in the middle. On the right is "Add feedback" (pushes straight to GitHub). When the app folder points to the public repository, "Send as GitHub issue" sits before it: pick several items from the current list to open one issue draft that lists them in order in the public repository's bug form (no pictures; if the address gets too long, only the first ones). The feedback window does not send items one by one. The time view is one table: time, state, content, screen, part, app version, fix commit. "In the app" next to the fix commit means the fix is in the app now; "App update needed" means it comes in once you get the new version (on Home, "Update available" means the research repository has commits to pull). Click a row to expand the original, the understood request and the handling.</> },
    { text: <>In an expanded item, the location text itself is a link to that spot. It is clickable only when there is a screen to go to; on hover it shows an underline and a "Go to that spot" tooltip.</> },
    { text: <>The same point raised more than once is merged into the latest item and shown as "+N". Comments you left are edited and deleted with the pencil and trash can that appear at the top right on hover.</> },
    { text: <>"Needs review" and the orange count on the rail are items where the agent asks you to decide (asked, agreed, or an answer with a question), plus items that were handled but not yet approved or revised.</> },
    { text: <>An opened item shows a handling summary at the top (understood request, cause and handling with their times, plus earlier versions) and the conversation between you and the maintainer below it. The bottom always has three buttons, named by the kind of answer. When the agent reports a result (applied, answered, declined, later) they are Ask · Revise · Approve: with the box empty only Approve is on, and typing turns on Ask and Revise. When the agent asks you to decide (asked, agreed, or an answer with a question) they are Ask · Stop · Proceed: Proceed has Claude go ahead, Stop ends it as is, and any text you type is saved with it. Ask leaves the handling as is, so the maintainer only answers. Revise and Proceed send the item back to waiting so Claude handles it again. Edit your own messages with the pencil at their top right, and "Undo" takes back your last answer.</> },
  ],
}
