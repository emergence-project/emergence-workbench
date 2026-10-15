import { go } from './router'

/**
 * 그림 보기(#/figures/open/<그림>)의 아래 목록 줄과 머리줄 목록 단추가 쓰는 거르기: 마지막으로 본 그림 목록의 것.
 * 노트 · 첫 화면처럼 목록 밖에서 열면 모든 그림을 줄에 둔다. (노트 렌더러가 FiguresPage를 불러오지 않게 따로 둔다)
 */
let listFilter: string | undefined
export const figureListFilter = () => listFilter
export const rememberFigureList = (filter: string | undefined) => { listFilter = filter }
/** 그림 하나 크게 보기. fromList: 보던 목록의 줄을 그대로 */
export function showFigure(id: string, fromList = false) { if (!fromList) listFilter = undefined; go({ page: 'figures', open: id }) }
