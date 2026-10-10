/** 기록 대상 이름: 화면과 에이전트 요약이 같은 폴더 이름을 같은 대상으로 읽는다. */
export const commentTargetSlug = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 160) || '_'
