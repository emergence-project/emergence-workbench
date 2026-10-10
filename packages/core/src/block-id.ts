/** 블록 id는 파일 이름이 되므로 소문자·숫자·하이픈만 허용한다. */
const BLOCK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 원고 컴파일 폴더(.build/manuscript, .build/manuscript-<키>)와 겹치는 블록 id. 새로 만들지 않는다 */
export const isReservedBlockId = (id: string): boolean => /^manuscript(?:-|$)/.test(id)

export function isValidBlockId(id: string): boolean {
  return id.length > 0 && id.length <= 80 && BLOCK_ID.test(id)
}
