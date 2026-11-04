/**
 * 클라우드 피드백 처리 스위치 (11/4 사용자 "그 정기 작업 끄고 켜는 것도 앱에서"): 피드백 폴더의 cloud.yaml.
 * 클라우드 정기 작업은 매번 이 파일을 먼저 읽고, 켜져 있지 않으면 아무것도 하지 않는다(파일이 없으면 꺼짐).
 * 켜져 있는 동안 맥의 「바로」 맡기기는 쉬어 같은 항목을 두 곳에서 맡지 않는다. 피드백처럼 개인 저장소에 올린다.
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

export interface FeedbackCloud { enabled: boolean; at: string | null }

const file = (dir: string) => path.join(dir, 'cloud.yaml')

export function readFeedbackCloud(dir: string): FeedbackCloud {
  try {
    const doc: unknown = YAML.parse(fs.readFileSync(file(dir), 'utf8'))
    if (!doc || typeof doc !== 'object') return { enabled: false, at: null }
    const enabled = 'enabled' in doc && doc.enabled === true
    const at = 'at' in doc && typeof doc.at === 'string' ? doc.at : null
    return { enabled, at }
  } catch { return { enabled: false, at: null } }
}

export function writeFeedbackCloud(dir: string, enabled: boolean, now = new Date()): FeedbackCloud {
  const at = now.toISOString().slice(0, 16)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file(dir), `# 클라우드 정기 작업이 피드백을 처리할지 (앱 설정 › 에이전트 › 앱 피드백에서 바꾼다)\nenabled: ${enabled}\nat: ${at}\n`)
  return { enabled, at }
}
