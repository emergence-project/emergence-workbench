/**
 * 카드 글(주제 이름 · 설명 · 미리보기 · 프로젝트 이름)의 글자 수. 화면과 서버가 같은 기준을 쓴다.
 * 줄바꿈은 세지 않는다. $…$ 수식 안에서는 보이는 글자만 센다: \alpha 같은 명령은 한 글자,
 * 중괄호 · ^ · _ · 빈칸과 $ 자체는 세지 않는다 (10/7 17:40 "수식 명령어의 단어 하나하나가 수에 잡힌다").
 */
export function charCount(s: string): number {
  let n = 0
  const parts = s.replace(/\r?\n/g, '').split(/(\$[^$]+\$)/)
  for (const part of parts) {
    if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
      const tex = part.slice(1, -1).replace(/\\(?:[a-zA-Z]+|.)/g, '#').replace(/[{}^_\s]/g, '')
      n += [...tex].length
    } else n += [...part].length
  }
  return n
}
