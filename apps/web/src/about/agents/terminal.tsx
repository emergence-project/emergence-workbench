import type { AboutSection } from '../types'

// 소개 › agents › 터미널. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '터미널', prs: [453, 459, 486],
  id: 'terminal',
  items: [
    { text: <>오른쪽 사이드바의 <b>터미널</b>(상단바의 「&gt;_」 갈래 아이콘)은 이 컴퓨터의 셸입니다(11/19). 보고 있는 프로젝트의 저장소 폴더에서 열립니다. 중앙과 프로젝트 밖 화면은 앱 저장소, 에이전트 화면은 연 대화의 프로젝트 폴더이고, 폴더를 못 찾으면(내려받은 앱의 중앙 등) 홈 폴더입니다. 대화를 연 에이전트 화면에서는 사이드바 맨 위 아이콘 줄 끝의 「&gt;_」가 세부 패널 자리를 터미널로 바꿉니다(11/23 머리에서 옮김). 같은 줄의 다른 아이콘을 누르면 세부 패널로 돌아오고, 대화 머리의 사이드바 단추는 칸을 닫으며, 터미널 칸 머리의 「크게」는 칸을 화면 반까지 넓히며 「닫기 ×」는 칸을 닫습니다. 터미널을 가려도 셸은 살아 있습니다. 새 대화 · 중앙 화면에서는 상단바의 오른쪽 사이드바 버튼이 터미널만 엽니다. 사용자가 직접 치는 창이라 중앙 · 에이전트의 권한은 그대로입니다.</> },
    { text: <>출력을 고르고 「대화에 붙이기」를 누르면 그 프로젝트의 에이전트 입력란에 붙습니다. 폰 등 다른 기기에서 연 화면에는 탭이 없고, 서버도 그 기기에서 오는 셸 요청을 막습니다.</> },
    { text: <>대화 답의 코드 블록에는 「복사」가 붙고, 셸 명령 블록(sh · bash · zsh · console · 언어 표시 없음)에는 「터미널에서 실행」도 붙습니다. 명령을 터미널에 넣기만 하므로, 확인하고 Enter를 눌러야 실행됩니다. 이미 열린 셸은 다른 대화 · 프로젝트로 옮겨도 그대로 두고 cd를 붙이지 않습니다(직접 옮긴 폴더를 바꾸지 않으려고). 셸이 연 폴더가 지금 대화의 것과 다르면 터미널 위에 그 폴더를 알리니, 확인하고 Enter를 누르거나 exit 뒤 가운데의 「새 세션」으로 지금 폴더에서 새로 여세요. 여러 줄은 셸이 붙여 넣기 모드를 켰을 때만 넣고, 아니면 복사만 합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Terminal',
  id: 'terminal',
  items: [
    { text: <>The <b>Terminal</b> tab in Right sidebar › Agents is a shell on this computer (11/19). It opens in the repository folder of what you are viewing: the app repository for Central and screens outside a project, the project folder of the open conversation on the Agents page, and the home folder when no folder is found (for example Central in the downloaded app). On the Agents page with a conversation open, the &gt;_ icon at the right of the conversation header turns the right column (where Details sits) into the terminal. The list icon next to it brings Details back, Widen in the terminal header widens the column to half the screen, and Close × closes it. Hiding the terminal keeps the shell running. On the new-conversation and Central screens the right sidebar button in the top bar opens the terminal alone. You type in it yourself, so Central's and the agents' permissions do not change.</> },
    { text: <>Select output and press Attach to chat to attach it to that project's agent input. Screens opened on a phone or another device have no tab, and the server refuses shell requests from them too.</> },
    { text: <>Code blocks in agent answers get Copy, and shell blocks (sh · bash · zsh · console · no language) also get Run in terminal. It only puts the command in the terminal; it runs when you check it and press Enter. A shell that is already open stays where it is when you move to another conversation or project, and no cd is added (so a folder you moved to yourself is never changed). When the shell was opened in a different folder than the current conversation's, the terminal shows that folder: check it and press Enter, or type exit and press New session in the middle to open a new shell in the current folder. Several lines go in only when the shell has paste mode (bracketed paste) on; otherwise they are only copied.</> },
  ],
}
