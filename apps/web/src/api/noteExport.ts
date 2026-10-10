// ---------- 노트 내보내기 (서버 noteExport.ts) ----------
import type { ExportOptions } from '@rw/core/contract/noteExport'
import { enc, json, req } from './http'

export type { ExportOptions } from '@rw/core/contract/noteExport'

/**
 * 내보내기 상자에서 고른 것 (10/4 반려 "옵션으로 선택: 1. 디자인 템플릿 2. 저자 포함 여부 3. 날짜 등").
 * template: 서식 id. authors: 넣을 저자 이름을 넣을 차례대로, 빈 목록이면 저자 없이.
 * date: 'none' | 'today' | 'YYYY-MM-DD'. 빼면 서버가 정한다 (원고는 프로젝트 서식·설정의 저자 모두·오늘, 노트는 저자·날짜 없이)
 */
export interface ExportChoice { template?: string; authors?: string[]; date?: string }

/** 노트(메인 노트 key) 하나 또는 여럿을 컴파일되는 LaTeX 폴더 zip으로 받는 주소. 여럿이면 main.tex 하나로 모은다 */
export const noteExportUrl = (rid: string, keys: string[], o: ExportChoice = {}) =>
  `/api/researches/${enc(rid)}/export?${[...keys.map((k) => `ms=${enc(k)}`), ...choiceParams(o)].join('&')}`

/** 보조 노트도 같은 서식·저자·날짜로 LaTeX 폴더 zip을 받는다. */
export const blockExportUrl = (rid: string, id: string, o: ExportChoice = {}) =>
  `/api/researches/${enc(rid)}/export?${[`block=${enc(id)}`, ...choiceParams(o)].join('&')}`

/** 고른 서식·저자·날짜를 주소 뒤에 붙일 조각으로 (내보내기와 컴파일이 같이 쓴다) */
export const choiceParams = (o: ExportChoice): string[] => [
  ...(o.template ? [`tpl=${enc(o.template)}`] : []),
  ...(o.authors === undefined ? [] : o.authors.length ? o.authors.map((n) => `au=${enc(n)}`) : ['au=']),
  ...(o.date ? [`date=${enc(o.date)}`] : []),
]

export const noteExportApi = {
  options: (rid: string) => req(`/api/researches/${enc(rid)}/export/options`).then((r) => json<ExportOptions>(r)),
}
