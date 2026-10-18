// YAML 파일 읽기·쓰기 (10/18 한 곳으로 모음). 주석·순서를 지키며 고치는 곳(parseDocument·글 편집:
// researchYaml.ts editResearchYaml, mainNote.ts, flow.ts, feedback.ts status.yaml …)은 여기를 쓰지 않는다.
import fs from 'node:fs'
import YAML from 'yaml'
import { writeAtomic } from './fsutil.js'

/**
 * YAML 파일을 읽는다. 파일이 없으면 undefined, 비었으면 null (YAML.parse와 같다). 문법이 깨졌으면 던진다.
 * 반환은 YAML.parse처럼 모양을 모르는 값이다: 쓰는 쪽이 칸마다 확인한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readYaml(file: string): any {
  if (!fs.existsSync(file)) return undefined
  return YAML.parse(fs.readFileSync(file, 'utf8'))
}

/** 값을 YAML로 바꿔 원자적으로 쓴다(임시 파일 → rename). header는 맨 앞 주석 줄(줄바꿈 포함), mode는 비밀값 권한 */
export function writeYaml(file: string, value: unknown, opts: { header?: string; mode?: number } = {}): void {
  writeAtomic(file, `${opts.header ?? ''}${YAML.stringify(value)}`, opts.mode === undefined ? {} : { mode: opts.mode })
}
