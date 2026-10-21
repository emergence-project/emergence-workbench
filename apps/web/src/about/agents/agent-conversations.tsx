import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › agents › 앱에서 맡기는 대화. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '앱에서 맡기는 대화', prs: [229],
  id: 'conversations',
  items: [
    { text: <>레일의 에이전트(반짝이)에서 프로젝트 하나에 일 하나씩 대화를 엽니다. 맥의 Claude Code가 그 프로젝트 저장소에서 일합니다. 상단바의 반짝이는 지금 프로젝트의 대화를 오른쪽 사이드바 자리에 엽니다.</> },
    { text: <>대화마다 범위(프로젝트 전체 · 주제 하나 · 노트 하나)와 고치기(읽기만 · 노트 고치기)를 고릅니다. 범위 밖은 필요할 때 읽고 대화에 「범위 밖」으로 보이지만, 고치지는 못합니다. 무엇을 어디서 고쳐야 하는지 말로 남깁니다.</> },
    { text: <>노트는 앱을 거쳐서만 고치고(수정 검토에 오름), 파일을 바로 쓰지 못합니다. 고치는 동안 그 노트를 잡아 다른 대화가 같은 노트를 고치지 못합니다. 지금 도는 대화와 잡은 파일은 에이전트 화면 첫 쪽과 {c('GET /api/agent-work')}에 같이 보입니다.</> },
    { text: <>명령을 돌리거나 웹을 읽으려 하면 허락 카드(주황 점)가 뜨고, 답할 때까지 기다립니다. 「이 대화에서 늘」은 같은 명령에만 적용됩니다. 허락을 기다리는 대화 수가 레일 배지에 보입니다.</> },
    { text: <>동시에 둘까지 돌고 나머지는 줄을 섭니다(맥 메모리). 대화 기록은 연구 저장소가 아니라 앱 설정 폴더에 남습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Conversations started from the app',
  id: 'conversations',
  items: [
    { text: <>From Agents on the rail (the sparkle), open one conversation per piece of work in a project. Claude Code on the Mac works in that project's repository. The sparkle in the top bar opens the current project's conversations in the right sidebar's place.</> },
    { text: <>Each conversation has a scope (whole project · one topic · one note) and a write level (read only · edit notes). It may read outside the scope when needed, shown as "Outside scope", but cannot change anything there; it says what should change and where instead.</> },
    { text: <>Notes change only through the app (they land in edit review); files cannot be written directly. While a conversation changes a note it holds it, so another conversation cannot change the same note. Running conversations and held files show on the first page of Agents and in {c('GET /api/agent-work')}.</> },
    { text: <>Running a command or reading the web shows an approval card (orange dot) and waits for your answer. "Always here" covers only the same command. The rail badge counts conversations waiting for approval.</> },
    { text: <>At most two run at once; the rest wait in a queue (Mac memory). Conversations are kept in the app's settings folder, not in the research repository.</> },
  ],
}
