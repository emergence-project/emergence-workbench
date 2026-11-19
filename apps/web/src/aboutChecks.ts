import { useQuery } from '@tanstack/react-query'
import { aboutChecks, type AboutCheck, type AboutChecks } from './api'
import { qk, queryClient } from './queries'
import type { AboutPart, AboutSection } from './about/types'

/**
 * 소개 절의 확인 상태 (11/8 20:47 제안, 11/11 18:48 진행 「안 C′」).
 * 확인은 (절, 업데이트) 줄마다 받는다 (11/20 시안 2절). 기록(about.yaml)에는 절 전체를 확인한 때의 마지막 PR(checked)과
 * 그 뒤 줄마다 확인한 PR(ok)을 적고, 상태는 절의 prs와 견주어 계산한다:
 * - 반영 대기: 고치기 탭으로 고쳐 보낸 뒤 그 절을 고친 PR이 아직 없다
 * - 확인 전: 확인하지 않은 업데이트 줄이 있다(확인한 적이 없고 PR이 있는 절도). 에이전트가 달고 떼지 않는다
 * - 확인함: 그 밖
 * 기록 파일이 없으면(확인을 시작하지 않았거나 피드백 폴더가 없는 앱) 아무 절도 확인 전으로 세지 않는다.
 */
export type AboutCheckState = 'checked' | 'unchecked' | 'pending'

export const lastPr = (sec: Pick<AboutSection, 'prs'>) => sec.prs?.[sec.prs.length - 1] ?? 0

/** 업데이트 줄 하나를 확인한 날 (확인하지 않았으면 undefined). 절 확인(checked) 아래 PR은 그 날 */
export const okDate = (rec: AboutCheck | undefined, n: number): string | undefined =>
  rec?.ok?.[String(n)] ?? (rec?.checked !== undefined && n <= rec.checked ? rec.at ?? '' : undefined)

/** 확인하지 않은 업데이트 줄 (확인 전의 까닭) */
export const prsSince = (sec: Pick<AboutSection, 'prs'>, rec: AboutCheck | undefined) => (sec.prs ?? []).filter((n) => okDate(rec, n) === undefined)

export function checkState(sec: Pick<AboutSection, 'prs'>, rec: AboutCheck | undefined, exists: boolean): AboutCheckState {
  const last = lastPr(sec)
  if (rec?.sentPr !== undefined && last <= rec.sentPr) return 'pending'
  if (!exists) return 'checked'
  return prsSince(sec, rec).length ? 'unchecked' : 'checked'
}

/** 절의 기록 키 <쪽>/<절> */
export const checkKey = (part: AboutPart, anchor: string) => `${part.id}/${anchor}`

const EMPTY: AboutChecks = { enabled: false, exists: false, sections: {}, prDates: {}, prTitles: {} }

/** 기록 읽기 (사이드바 · 쪽 · 레일의 수가 한 요청을 나눠 쓴다) */
export function useAboutChecks(): AboutChecks {
  const q = useQuery({ queryKey: qk.aboutChecks, queryFn: aboutChecks })
  return q.data ?? EMPTY
}

/** 고친 뒤 받은 기록을 캐시에 바로 둔다 */
export const putAboutChecks = (v: AboutChecks) => queryClient.setQueryData(qk.aboutChecks, v)
