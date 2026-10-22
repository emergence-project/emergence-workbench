import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { PROJECT_COLORS } from '@rw/core/contract/research'
import { machineName } from './backup.js'
import { PROJECT_KINDS, PROJECT_STATES, type ProjectProfile, type ProjectState, type Registry } from './registry.js'

/**
 * 프로젝트의 성격 · 분야 · 진행 상태 · 띠 · 색을 컴퓨터 사이에 맞춘다 (10/22 09:44 "맥북에서 종료한 프로젝트가 맥미니에서 다시 살아남").
 *
 * 앱 설정은 컴퓨터마다 따로라(backup.ts), 한 컴퓨터에서 완료로 바꿔도 다른 컴퓨터의 설정은 그대로였고,
 * 다른 컴퓨터의 프로젝트를 받아 등록할 때도 진행 상태를 옮기지 않았다. 그래서:
 * - 고칠 때마다 고친 때(profileAt)를 적고, 각 컴퓨터가 _settings/<컴퓨터>/projects.yaml에 함께 올린다.
 * - 맞추기(백업)가 끝나면 다른 컴퓨터들의 목록에서 같은 GitHub 저장소를 찾아, 더 늦게 고친 쪽을 이 컴퓨터에 적는다.
 * - 아직 고친 때가 없는 예전 기록끼리는(양쪽 다 없음) 이 컴퓨터가 진행이고 다른 쪽이 멈춤 · 완료일 때만 그 상태를 따른다.
 *   진행은 아무것도 고치지 않은 기본값이라, 멈춤 · 완료는 누군가 고른 것이다.
 */
/** profile이 없으면 예전 목록이라 진행 상태(legacyState)만 있다 */
export interface OtherProfile { machine: string; remote: string; profile?: ProjectProfile; profileAt?: string; legacyState?: ProjectState }

const time = (at?: string) => (at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : 0)

function profileFrom(r: Record<string, unknown>): ProjectProfile | null {
  const p = r.profile as Record<string, unknown> | undefined
  if (p && typeof p === 'object') {
    if (!PROJECT_KINDS.includes(p.kind as ProjectProfile['kind']) || !PROJECT_STATES.includes(p.state as ProjectState) || !Array.isArray(p.fields)) return null
    return {
      kind: p.kind as ProjectProfile['kind'], fields: p.fields.map(String), state: p.state as ProjectState, rail: p.rail === true,
      ...(PROJECT_COLORS.includes(p.color as ProjectProfile['color'] & string) && { color: p.color as ProjectProfile['color'] }),
    }
  }
  return null
}

/** 다른 컴퓨터들이 올린 프로젝트 목록에서 GitHub 주소가 있는 것마다 그 컴퓨터의 설정 (예전 목록은 state만 있다) */
export function otherMachineProfiles(dir: string, machine = machineName()): OtherProfile[] {
  const root = path.join(dir, '_settings')
  let names: string[] = []
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== machine).map((d) => d.name).sort() } catch { return [] }
  const out: OtherProfile[] = []
  for (const m of names) {
    let list: unknown
    try { list = YAML.parse(fs.readFileSync(path.join(root, m, 'projects.yaml'), 'utf8')) } catch { continue }
    for (const raw of Array.isArray(list) ? list : []) {
      const r = (raw ?? {}) as Record<string, unknown>
      if (typeof r.remote !== 'string' || !r.remote) continue
      const profile = profileFrom(r)
      if (profile) out.push({ machine: m, remote: r.remote, profile, ...(typeof r.profileAt === 'string' && { profileAt: r.profileAt }) })
      else if (PROJECT_STATES.includes(r.state as ProjectState)) out.push({ machine: m, remote: r.remote, legacyState: r.state as ProjectState })
    }
  }
  return out
}

/**
 * 다른 컴퓨터에서 더 늦게 고친 설정을 이 컴퓨터에 적는다. 바꾼 프로젝트 id 목록.
 * sameRepo · remoteOf는 받는다 (테스트가 git 없이 부르게)
 */
export async function adoptOtherProfiles(registry: Registry, dir: string, deps: {
  remoteOf(p: string): Promise<string | null>
  sameRepo(a: string | null, b: string | null): boolean
  machine?: string
}): Promise<string[]> {
  const others = otherMachineProfiles(dir, deps.machine)
  if (!others.length) return []
  const changed: string[] = []
  for (const r of registry.list()) {
    const mine = registry.sharedProfile(r.id)
    if (!mine) continue
    const remote = await deps.remoteOf(r.path)
    if (!remote) continue
    const theirs = others.filter((o) => deps.sameRepo(o.remote, remote))
    if (!theirs.length) continue
    const newest = theirs.filter((o) => o.profile).sort((a, b) => time(b.profileAt) - time(a.profileAt))[0]
    if (newest?.profile && time(newest.profileAt) > time(mine.profileAt)) {
      const p = newest.profile
      registry.setProfile(r.id, { kind: p.kind, fields: p.fields, state: p.state, rail: p.rail, color: p.color ?? null }, newest.profileAt)
      if (JSON.stringify(p) !== JSON.stringify(mine.profile)) changed.push(r.id)
      continue
    }
    // 양쪽 다 고친 때가 없는 예전 기록: 이 컴퓨터가 진행(기본)이고 다른 쪽이 멈춤 · 완료면 그것을 따른다
    if (!mine.profileAt && mine.profile.state === 'active') {
      const picked = theirs.map((o) => o.profile?.state ?? o.legacyState).find((s) => s && s !== 'active')
      if (picked && !theirs.some((o) => o.profileAt)) {
        registry.setProfile(r.id, { state: picked }, new Date(0).toISOString())
        changed.push(r.id)
      }
    }
  }
  return changed
}
