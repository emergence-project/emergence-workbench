import type { AboutSection } from '../types'

// 소개 › home › 프로젝트 목록과 카드. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '프로젝트 목록과 카드', prs: [95, 112, 204, 219],
  items: [
    { text: <>프로젝트 위의 <b>시작 준비</b> 카드는 설정 › 계정의 꼭 할 것(GitHub 로그인 · 커밋에 적힐 이름 · 내 이름·소속 · 첫 프로젝트)이 남았을 때만 보이고, 남은 것을 적고 그 화면으로 갑니다.</> },
    { text: <>오른쪽 위에서 <b>목록</b>(기본)과 <b>카드</b> 보기를 고릅니다. 고른 보기는 기억합니다. 어디를 눌러도 그 프로젝트 첫 화면이 열립니다.</> },
    { text: <>프로젝트마다 <b>성격</b>(연구 · 업무 중 하나), <b>분야</b>(개념노트 분류에서 고르는 태그 여러 개), <b>진행 상태</b>(진행 · 멈춤 · 완료)가 있습니다. 왼쪽 필터는 성격(전체 · 연구 · 업무), 오른쪽 필터는 진행 상태입니다. 분야는 보이기만 합니다. 세 값은 프로젝트 첫 화면이나 정보 화면의 연필로 여는 고치기 창에서 고르고, 이 컴퓨터의 설정에만 남습니다(예전 "업무" 태그는 성격 업무로, 나머지 태그는 분야로 읽습니다).</> },
    { text: <>상태 기호(아래 "한 일 달력"의 표): 주황 점은 <b>확인 필요</b>(확인이 필요한 노트와 판단할 맡긴 일, 레일의 수와 같음), 돌아가는 화살표는 <b>업데이트 필요</b>(GitHub에 받을 새 커밋), 둘 다면 화살표 오른쪽 위에 주황 점. 기호 뜻은 목록 오른쪽 아래에도 있습니다. 앱은 10분마다 GitHub를 확인해, 받을 수 있으면(빨리 감기만) 저절로 받습니다(진행 중인 프로젝트만). 화살표가 남아 있으면 지금 눌러 받거나, 받지 못한 까닭을 툴팁에서 봅니다.</> },
    { text: <>카드는 왼쪽에 프로젝트 색 영역과 가운데 프로젝트 그림(프로젝트 고치기 창의 "카드 그림", 없으면 색만), 오른쪽에 이름 · 한 줄 설명 · [성격]과 분야 한 줄 · 최근 시각과 상태 기호가 있습니다.</> },
    { text: <>카드의 색 영역(목록은 머리 글자 네모)을 잡아 끌면 순서가 바뀝니다. 목록 · 카드 · 레일이 같은 순서입니다.</> },
    { text: <>카드 끝의 "＋ 프로젝트 등록"(또는 레일의 ＋)에는 두 길이 있습니다. "GitHub에서"는 내 GitHub 저장소 목록에서 찾아 고르면 이 컴퓨터로 받아 온 뒤 등록합니다(이미 등록한 것은 "등록됨"). "이 컴퓨터 폴더"는 폴더 경로를 넣거나 "Finder에서 고르기"로 맥의 폴더 고르기 창에서 고릅니다(고르면 바로 확인). 받을 폴더도 같은 버튼으로 고릅니다. 등록 카드는 "진행" 목록에만 있습니다(새 프로젝트는 진행으로 등록됩니다).</> },
    { text: <>GitHub 목록은 맥에 이미 있는 GitHub 로그인(gh 또는 git이 쓰는 키체인)으로 읽고, 앱은 로그인 정보를 따로 저장하지 않습니다. 목록이 안 보이면 맥 터미널에서 <code>gh auth login</code>을 하거나 GitHub 주소를 붙여 넣습니다. 구글 계정은 저장소가 아니라 캘린더·드라이브에만 씁니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Project list and cards',
  items: [
    { text: <>The <b>Getting started</b> card above the projects shows only while required steps in Settings › Accounts are left (GitHub sign-in · name on commits · your name and affiliation · first project). It lists what is left and opens that screen.</> },
    { text: <>At the top right you choose between the <b>List</b> view (default) and the <b>Cards</b> view. Your choice is remembered. Clicking anywhere on a project opens its home screen.</> },
    { text: <>Each project has a <b>kind</b> (Research or Work), <b>fields</b> (several tags chosen from the concept note subjects), and a <b>progress status</b> (In progress · Blocked · Done). The left filter is kind (All · Research · Work) and the right filter is progress status. Fields are only shown. All three are chosen in the edit dialog opened by the pencil on the project home screen or the info screen, and are kept only in this computer's settings (an old "업무" (work) tag is read as kind Work, and other tags are read as fields).</> },
    { text: <>Status symbols (see the table under "Work calendar" below): an orange dot means <b>Needs review</b> (notes to review and delegated tasks to decide, the same count as on the rail), a circular arrow means <b>Update available</b> (new commits to pull from GitHub), and when both apply an orange dot sits at the arrow's top right. The symbol legend is also at the bottom right of the list. Every 10 minutes the app checks GitHub and pulls on its own when it can (fast-forward only, active projects only). If the arrow stays, click it to pull now, or see the reason in its tooltip.</> },
    { text: <>A card has the project's color area on the left with the project image in the middle (the "Card image" in the project edit dialog; color only if none), and on the right the name, a one-line description, [kind] and fields on one line, and the last activity time with status symbols.</> },
    { text: <>Drag a card's color area (in the list, the initials square) to reorder. The list, cards and rail all share the same order.</> },
    { text: <>The "＋ Register project" at the end of the cards (or ＋ on the rail) offers two ways. "From GitHub" lets you search and pick from your GitHub repositories; the app clones it to this computer and registers it (ones already registered show "Registered"). "Folder on this computer" takes a folder path. Or press "Choose in Finder" to pick it in the Mac folder dialog (it is checked right away); the clone folder has the same button. The register card shows only in the "In progress" list (new projects are registered as in progress).</> },
    { text: <>The GitHub list is read with the GitHub login already on the Mac (the keychain used by gh or git), and the app stores no login details of its own. If the list does not show, run <code>gh auth login</code> in a Mac terminal, or paste the GitHub address. The Google account is used only for Calendar and Drive, not for repositories.</> },
  ],
}
