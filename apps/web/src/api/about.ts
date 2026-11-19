// ---------- 소개 절 확인 기록 (피드백 폴더 about.yaml, 서버 routes/about.ts) ----------
import { json, req, send } from './http'
import type { AboutChanges, AboutCheckBody, AboutChecks } from '@rw/core/contract/about'

export type { AboutChanges, AboutCheck, AboutChecks } from '@rw/core/contract/about'

export const aboutChecks = () => req('/api/about/checks').then((r) => json<AboutChecks>(r))
export const setAboutCheck = (b: AboutCheckBody) => req('/api/about/checks', send('PUT', b)).then((r) => json<AboutChecks>(r))
/** 업데이트 하나가 바꾼 소개 문장과 요약 (이력 표의 줄을 누를 때) */
export const aboutChanges = (pr: number) => req(`/api/about/changes?pr=${pr}`).then((r) => json<AboutChanges>(r))
