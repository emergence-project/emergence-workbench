/** 공부(책 · 강의)의 종류와 장 상태 (11/10, 라이브러리 study/<id>.yaml). 화면이 zod 없이 쓰게 계약 밖에 둔다 */
export const STUDY_KINDS = ['책', '강의'] as const
export const STUDY_STATES = ['아직', '읽는 중', '끝'] as const
