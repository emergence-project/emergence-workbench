/** 블록 id는 파일 이름이 되므로 소문자·숫자·하이픈만 허용한다. */
const BLOCK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidBlockId(id: string): boolean {
  return id.length > 0 && id.length <= 80 && BLOCK_ID.test(id)
}
