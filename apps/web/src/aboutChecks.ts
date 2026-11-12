import { useQuery } from '@tanstack/react-query'
import { aboutChecks, type AboutCheck, type AboutChecks } from './api'
import { qk, queryClient } from './queries'
import type { AboutPart, AboutSection } from './about/types'

/**
 * 소개 절의 확인 상태 (11/8 20:47 제안, 11/11 18:48 진행 「안 C′」).
 * 확인 단위는 절 하나다. 기록(about.yaml)에는 확인한 때 그 절의 마지막 PR 번호만 적고, 상태는 절의 prs와 견주어 계산한다:
 * - 반영 대기: 연필로 고쳐 보낸 뒤 그 절을 고친 PR이 아직 없다
 * - 확인 전: 확인한 PR 뒤에 그 절을 고친 PR이 있다(확인한 적이 없고 PR이 있는 절도). 에이전트가 달고 떼지 않는다
 * - 확인함: 그 밖
 * 기록 파일이 없으면(확인을 시작하지 않았거나 피드백 폴더가 없는 앱) 아무 절도 확인 전으로 세지 않는다.
 */
export type AboutCheckState = 'checked' | 'unchecked' | 'pending'

export const lastPr = (sec: Pick<AboutSection, 'prs'>) => sec.prs?.[sec.prs.length - 1] ?? 0

export function checkState(sec: Pick<AboutSection, 'prs'>, rec: AboutCheck | undefined, exists: boolean): AboutCheckState {
  const last = lastPr(sec)
  if (rec?.sentPr !== undefined && last <= rec.sentPr) return 'pending'
  if (!exists) return 'checked'
  return last > (rec?.checked ?? 0) ? 'unchecked' : 'checked'
}

/** 확인한 뒤 그 절을 고친 PR들 (확인 전의 까닭) */
export const prsSince = (sec: Pick<AboutSection, 'prs'>, rec: AboutCheck | undefined) => (sec.prs ?? []).filter((n) => n > (rec?.checked ?? 0))

/** 절의 기록 키 <쪽>/<절> */
export const checkKey = (part: AboutPart, anchor: string) => `${part.id}/${anchor}`

const EMPTY: AboutChecks = { enabled: false, exists: false, sections: {}, prDates: {} }

/** 기록 읽기 (사이드바 · 쪽 · 레일의 수가 한 요청을 나눠 쓴다) */
export function useAboutChecks(): AboutChecks {
  const q = useQuery({ queryKey: qk.aboutChecks, queryFn: aboutChecks })
  return q.data ?? EMPTY
}

/** 고친 뒤 받은 기록을 캐시에 바로 둔다 */
export const putAboutChecks = (v: AboutChecks) => queryClient.setQueryData(qk.aboutChecks, v)
