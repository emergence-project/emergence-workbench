import * as parts from './settings/parts'
import type { AboutPart } from './types'

// 소개 › 설정 (#/about/settings). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'settings', title: '설정',
  sub: '레일 맨 아래 톱니바퀴. 왼쪽 사이드바에서 부분을 골라 봅니다.',
  open: [{ label: '설정 열기', to: { page: 'settings' } }],
  sections: [parts.ko],
}

export const en: AboutPart = {
  id: 'settings', title: 'Settings',
  sub: 'The gear at the bottom of the rail. Choose a part in the left sidebar.',
  open: [{ label: 'Open Settings', to: { page: 'settings' } }],
  sections: [parts.en],
}
