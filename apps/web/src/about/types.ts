import type { ReactNode } from 'react'
import type { Route } from '../router'

// 소개 글의 모양 (aboutContent.tsx가 모아 내보낸다)

export interface AboutItem {
  text: ReactNode
  /** 확인이 필요한 이해 */
  unsure?: boolean
  /** unsure일 때 쪽 맨 위 알림에 보일 질문 한 문장 */
  ask?: string
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
  /** 이 절을 고친 업데이트(PR 번호), 오래된 것부터. 한국어 쪽에만 적고 영어는 같은 자리의 것을 쓴다 (10/15 "소개와 업데이트 1대1") */
  prs?: number[]
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
