import type { ReactNode } from 'react'
import type { Route } from '../router'

// 소개 글의 모양 (aboutContent.tsx가 모아 내보낸다)

export interface AboutItem {
  text: ReactNode
}

export interface AboutSection {
  title: string
  /** 주소 #/about/<쪽>/<id>로 바로 가는 절 (10/14) */
  id?: string
  /** Feedback-mode part name (data-ui): the Korean title, also in English */
  ui?: string
  /** 목록 위에 놓는 그림·표 (10/8 "기호와 구조는 표와 그림으로도") */
  figure?: ReactNode
  items: AboutItem[]
  /** 확인 전일 때 쪽 맨 위 「확인할 것」에 덧붙일 물음 한 문장 (11/11 안 C′: 확인은 절 단위, 문장마다의 「확인 필요」는 없앰) */
  ask?: string
  /** 이 절을 고친 업데이트(PR 번호), 오래된 것부터. 한국어 쪽에만 적고 영어는 같은 자리의 것을 쓴다 (10/15 "소개와 업데이트 1대1") */
  prs?: number[]
  /** 절 파일 about/<쪽>/<절>.md의 "<쪽>/<절>" (.md 절만, 11/27) */
  file?: string
  /** 이 절로 합치거나 이름을 바꾼 옛 절 키: 옛 PR 조각의 번호가 이 절에 붙는다 (.md의 was) */
  was?: string[]
  /** 한 줄 요약: 절 제목 밑에 보이고 에이전트가 먼저 받는 글 (11/27 "소개를 에이전트가 읽는 정본으로") */
  summary?: string
  /** 지킬 것: 이 기능을 고칠 때 깨면 안 되는 것 (있는 절만) */
  keep?: AboutItem[]
  /** 결정: 날짜와 무엇을 한 줄씩 (있는 절만) */
  decisions?: AboutItem[]
  /** 구현 파일 glob (저장소 뿌리 기준) */
  code?: string[]
  /** 이 기능을 쓰는 MCP 도구 */
  mcp?: string[]
  /** 이 기능을 다른 앱에 옮기는 이식 안내서 docs/ports/<port>.md (11/19 "이식 안내서와 소개를 동기화"). 안내서 머리 about:에 이 절 파일이 있어야 한다 (scripts/ci/check-ports.mjs) */
  port?: string
}

export interface AboutPart {
  id: string
  /** 왼쪽 목록과 큰 제목 */
  title: string
  /** Feedback-mode part name (data-ui): the Korean title, also in English */
  ui?: string
  /** 이 쪽이 다루는 화면을 한 줄로 */
  sub: ReactNode
  /** 실제 화면으로 가는 길 (프로젝트 밖 화면만) */
  open?: { label: string; to: Route }[]
  sections?: AboutSection[]
  /** 아직 없는 것·사용자 답을 기다리는 것 */
  left?: ReactNode[]
}

export interface ColorRow { status?: 'in-progress' | 'blocked' | 'stopped' | 'solved' | 'none'; token?: string; color: string; name: string; meaning: string; where: string }

export interface SymbolRow { mark: ReactNode; name: string; meaning: string; where: string }
