import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › agents › 실제 연구에 닿지 않게. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '실제 연구에 닿지 않게',
  items: [
    { text: <>개발은 예제 모드({c('pnpm dev')}, 저장소 안 {c('.sandbox/')} 복사본)에서 합니다. 화면 위 배너가 예제 모드 표시입니다.</> },
    { text: <>실제 연구 저장소는 사용자가 확인한 뒤에만 바꿉니다. Overleaf와 이어진 원고는 앱이 밀어 올리지 않습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Keeping real research safe',
  items: [
    { text: <>Development happens in sample mode ({c('pnpm dev')}, a copy in {c('.sandbox/')} inside the repository). The banner at the top of the screen marks sample mode.</> },
    { text: <>Real research repositories change only after you have reviewed the change. A manuscript linked to Overleaf is never pushed by the app.</> },
  ],
}
