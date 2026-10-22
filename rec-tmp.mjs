import fs from 'node:fs'
import { parseDocument } from 'yaml'
const f = 'feedback/status.yaml'
const doc = parseDocument(fs.readFileSync(f, 'utf8'))
const now = '2026-10-21T20:45'
const A = 'https://claude.ai/artifact/BpGCWUdL5U6zi9tU5YsBfV ("파일 쪽 · 받기 기호 · 레일 단추 (만든 것)" 절)'
const add = (key, note, pics, to) => {
  const it = doc.get(key)
  const r = it.get('replies')
  r.add(doc.createNode({ at: now, to, note, by: 'claude' }))
  it.delete('ask')
  it.set('pictures', doc.createNode(pics))
}
add('2026-10-21 12:16 사이드바 › 프로젝트 목차 › 참고 자료 하위 목록',
  `수정 완료 (#228). 프로젝트 정보에 "파일" 쪽을 더했습니다(사이드바 저장소 아래). 왼쪽에 저장소 파일 나무(앱에서의 뜻을 회색으로, 커밋 안 한 파일은 주황 점, 이름 찾기, 경계를 끌거나 "나무 접기"), 오른쪽에서 고른 파일을 읽습니다. 코드는 줄 번호와 문법 색으로 보이고, "탭으로 열기" · "Finder에서 보기" · "맥 앱으로 열기"가 있습니다. 읽기 전용입니다. 전후 그림: ${A}.`,
  ['2026-10-21-files-before.png', '2026-10-21-files-after.png'], '2026-10-21T16:27')
add('2026-10-21 12:02 왼쪽 띠',
  `수정 완료 (#228). 레일의 받기 단추를 다른 레일 단추처럼 회색 아이콘으로 바꾸고, 새 버전이 있으면 오른쪽 위에 주황 점을 붙였습니다. 기호도 흔히 쓰는 받기 기호(아래 화살표와 받침)로 바꾸고, 노트 내보내기는 공유 기호(상자 위 화살표)로 바꿔 겹치지 않게 했습니다. 전후 그림: ${A}.`,
  ['2026-10-21-railupdate-before.png', '2026-10-21-railupdate-after.png'], '2026-10-21T16:28')
fs.writeFileSync(f, doc.toString({ lineWidth: 0, indentSeq: false }))
