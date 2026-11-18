import type { AboutSection } from '../types'

// 소개 › agents › 터미널. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '터미널',
  id: 'terminal',
  items: [
    { text: <>오른쪽 사이드바 › 에이전트의 <b>터미널</b> 탭은 이 컴퓨터의 셸입니다(11/19). 보고 있는 프로젝트 폴더에서 열리고(프로젝트 밖 화면은 홈 폴더), 에이전트 화면에서는 상단바의 오른쪽 사이드바 버튼이 터미널만 엽니다. 사용자가 직접 치는 창이라 중앙 · 에이전트의 권한은 그대로입니다.</> },
    { text: <>출력을 고르고 「대화에 붙이기」를 누르면 그 프로젝트의 에이전트 입력란에 붙습니다. 폰 등 다른 기기에서 연 화면에는 탭이 없고, 서버도 그 기기에서 오는 셸 요청을 막습니다.</> },
    { text: <>대화 답의 코드 블록에는 「복사」가 붙고, 셸 명령 블록(sh · bash · zsh · console · 언어 표시 없음)에는 「터미널에서 실행」도 붙습니다. 명령을 터미널에 넣기만 하므로, 확인하고 Enter를 눌러야 실행됩니다. 여러 줄은 셸이 붙여 넣기 모드를 켰을 때만 넣고, 아니면 복사만 합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Terminal',
  id: 'terminal',
  items: [
    { text: <>The <b>Terminal</b> tab in Right sidebar › Agents is a shell on this computer (11/19). It opens in the folder of the project you are viewing (the home folder outside a project); on the Agents page the right sidebar button in the top bar opens the terminal alone. You type in it yourself, so Central's and the agents' permissions do not change.</> },
    { text: <>Select output and press Attach to chat to attach it to that project's agent input. Screens opened on a phone or another device have no tab, and the server refuses shell requests from them too.</> },
    { text: <>Code blocks in agent answers get Copy, and shell blocks (sh · bash · zsh · console · no language) also get Run in terminal. It only puts the command in the terminal; it runs when you check it and press Enter. Several lines go in only when the shell has paste mode (bracketed paste) on; otherwise they are only copied.</> },
  ],
}
