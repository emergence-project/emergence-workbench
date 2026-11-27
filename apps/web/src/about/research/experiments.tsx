import { ExperimentsTable } from '../../ResearchTables'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › research › 실험과 판정. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs는 ko에만 적는다(조각 about/prs/<번호>.json).

export const ko: AboutSection = {
  title: '실험과 판정', id: 'experiments',
  figure: <ExperimentsTable />,
  items: [
    { text: <>실험마다 <b>왜 두는지 · 무엇으로 효과를 잴지 · 다시 볼 날</b>을 적습니다. 다시 볼 날이 되면 앱이 알리고, 사용자가 유지 · 보류 · 되돌림을 정합니다(2026-11-27 사용자 결정 "해 보고 좋으면 유지, 별로면 기록을 남기고 되돌린다").</> },
    { text: <><b>판정</b>: 지켜봄(쓰면서 재는 중) · 유지 · 보류(사용자가 멈춤, 알리지 않음) · 되돌림 · 결정 필요. 결정 필요이고 답이 없는 줄만 주황이며 알림 「답할 것」에도 뜹니다. 답은 알림이 아니라 이 표에서 합니다.</> },
    { text: <><b>울타리</b>: 화면 · 서버 곳곳에 걸린 실험(지금은 흐름)은 그 기능이 가진 파일과, 그 파일을 불러도 되는 바깥 자리(이음매)를 목록에 적습니다. 검사({c('pnpm test')})가 새 자리에서 부르는 것을 막아, 끄거나 지울 때 고칠 곳이 늘 그 목록과 같습니다. 다시 볼 날이 지나도 판정을 적지 않으면 같은 검사가 실패합니다(2026-11-27 사용자 결정).</> },
    { text: <>되돌린 실험은 지우지 않고 표 아래 「되돌리거나 없앤 것」에 이유와 함께 접어 둡니다. 같은 시도를 다시 할 때 근거가 됩니다.</> },
    { text: <>목록의 정본은 앱 저장소의 {c('docs/rules/registry.json')} 하나이고(에이전트 규칙과 같은 파일, 갈래 {c('experiment')}), 더하거나 바꾸는 일은 PR로 합니다. 기능의 설명은 그 화면의 절(예: 프로젝트 화면 › 흐름)에 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Experiments and verdicts', id: 'experiments',
  figure: <ExperimentsTable />,
  items: [
    { text: <>Each experiment records <b>why it exists, how its effect is gauged, and a review date</b>. On the review date the app tells you, and you decide to keep, hold or revert it (user decision 2026-11-27: "try it; keep it if it helps, otherwise write down why and revert").</> },
    { text: <><b>Verdicts</b>: Watching (being measured in use) · Keep · On hold (you paused it; no reminders) · Reverted · Needs decision. Only an unanswered Needs decision row is orange, and it also shows under "To answer" in the bell. You answer in this table, not in the bell.</> },
    { text: <><b>Fence</b>: an experiment wired into screens and the server (for now Flow) lists the files it owns and the outside spots allowed to call them (seams). A check ({c('pnpm test')}) blocks calls from any new spot, so the places to change when turning it off or removing it always match that list. The same check fails once the review date passes without a verdict (user decision 2026-11-27).</> },
    { text: <>A reverted experiment is not deleted: it stays folded under "Reverted or removed" below the table with its reason, as grounds if the same idea comes back.</> },
    { text: <>The single source is {c('docs/rules/registry.json')} in the app repository (the same file as the agent rules, kind {c('experiment')}); additions and changes go through a PR. Each feature is described in its screen's section (for example Project screen › Flow).</> },
  ],
}
