// ---------- 소개 절 확인 기록 (피드백 폴더 about.yaml, 서버 routes/about.ts) ----------
import { json, req, send } from './http'
import type { AboutCheckBody, AboutChecks } from '@rw/core/contract/about'

export type { AboutCheck, AboutChecks } from '@rw/core/contract/about'

export const aboutChecks = () => req('/api/about/checks').then((r) => json<AboutChecks>(r))
export const setAboutCheck = (b: AboutCheckBody) => req('/api/about/checks', send('PUT', b)).then((r) => json<AboutChecks>(r))
