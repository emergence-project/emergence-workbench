/**
 * 지식 지도의 분야 색 (2026-11-28 "점 색 = 분야", 디자인 기준의 예외): subjects.yaml 맨 위 분류의 `color:`에 이름으로 적는다.
 * 실제 색은 화면 tokens.css의 `--field-<이름>`(라이트 · 다크). 주황 · 빨강 · 노랑은 뜻이 정해진 색이라 없다.
 * 서버(계약)와 화면이 함께 쓰므로 zod 없이 둔다.
 */
export const FIELD_COLORS = ['violet', 'indigo', 'blue', 'cyan', 'teal', 'green', 'olive', 'ochre', 'brown', 'pink', 'magenta', 'gray'] as const
export type FieldColor = (typeof FIELD_COLORS)[number]
/** 색을 적지 않은 분야가 차례로 받는 기본 색 (분류 없음은 늘 gray) */
export const DEFAULT_FIELD_ORDER: readonly FieldColor[] = ['violet', 'blue', 'cyan', 'pink', 'ochre', 'olive', 'teal', 'indigo', 'green', 'brown', 'magenta']
export const isFieldColor = (v: unknown): v is FieldColor => typeof v === 'string' && (FIELD_COLORS as readonly string[]).includes(v)
