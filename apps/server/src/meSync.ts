import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { normalizeAuthors, normalizePeople, type Author, type Person } from '@rw/core'
import { machineName } from './backup.js'
import type { Registry } from './registry.js'

/**
 * 내 정보(저자 · 소속과 커밋 이름)를 컴퓨터 사이에 맞춘다 (11/20 피드백 22:30 「진행: 개인 저장소 한 파일에 두어 모든 컴퓨터가 함께 쓰기」).
 *
 * 앱 설정은 컴퓨터마다 따로라(backup.ts) 맥북에 적은 이름 · 소속이 맥미니 · 새 컴퓨터로 오지 않았다. 각 컴퓨터의 설정은 이미
 * 개인 저장소 _settings/<컴퓨터>/config.yaml로 올라가므로, 따로 파일을 두지 않고 그것을 함께 쓴다:
 * - 고칠 때마다 고친 때(meAt)를 적는다(registry.ts setAuthors · setGitIdentity).
 * - 맞추기가 끝나면 다른 컴퓨터들의 설정에서 더 늦게 고친 내 정보를 이 컴퓨터에 적는다.
 * - 고친 때가 없는 예전 설정끼리는 이 컴퓨터에 비어 있는 칸만 채운다(적어 둔 값은 바꾸지 않는다).
 * 네트워킹의 사람 목록도 같은 방식으로 맞춘다(11/20 피드백 02:28 「진행」): 고친 때는 따로 peopleAt. 목록 하나를 통째로 따른다.
 * 컴퓨터마다 다른 것(폴더 경로)은 맞추지 않는다. 논문 PDF 폴더는 설정 화면이 다른 컴퓨터의 폴더를 보이고 고르게 한다(otherPdfFolders).
 */
export interface OtherMe { machine: string; authors: Author[]; gitIdentity?: { name: string; email: string }; meAt?: string; people: Person[]; peopleAt?: string; pdfFolders: string[] }

/** 설정 파일의 커밋 이름 (이름 · 이메일 둘 다 있어야) */
export function identityOf(v: unknown): { name: string; email: string } | undefined {
  if (!v || typeof v !== 'object' || !('name' in v) || !('email' in v)) return undefined
  const { name, email } = v
  return typeof name === 'string' && name.trim() && typeof email === 'string' && email.trim() ? { name: name.trim(), email: email.trim() } : undefined
}

const time = (at?: string) => (at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : 0)

/** 백업 사본(개인 저장소)에서 다른 컴퓨터들의 내 정보 */
export function otherMachineMe(dir: string, machine = machineName()): OtherMe[] {
  const root = path.join(dir, '_settings')
  let names: string[] = []
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== machine).map((d) => d.name).sort() } catch { return [] }
  const out: OtherMe[] = []
  for (const m of names) {
    let parsed: unknown
    try { parsed = YAML.parse(fs.readFileSync(path.join(root, m, 'config.yaml'), 'utf8')) } catch { continue }
    const raw: Record<string, unknown> = parsed && typeof parsed === 'object' ? { ...parsed } : {}
    const gitIdentity = identityOf(raw.gitIdentity)
    out.push({
      machine: m, authors: normalizeAuthors(raw.authors, []),
      ...(gitIdentity && { gitIdentity }),
      ...(typeof raw.meAt === 'string' && time(raw.meAt) > 0 && { meAt: raw.meAt }),
      people: normalizePeople(raw.people),
      ...(typeof raw.peopleAt === 'string' && time(raw.peopleAt) > 0 && { peopleAt: raw.peopleAt }),
      pdfFolders: Array.isArray(raw.pdfFolders) ? raw.pdfFolders.filter((p): p is string => typeof p === 'string' && path.isAbsolute(p)) : [],
    })
  }
  return out
}

type MeField = 'authors' | 'gitIdentity' | 'people'

/** 다른 컴퓨터의 내 정보 · 사람 목록을 이 컴퓨터에 적는다. 바꾼 칸 (없으면 빈 목록) */
export function adoptOtherMe(registry: Registry, dir: string, machine = machineName()): MeField[] {
  const others = otherMachineMe(dir, machine)
  if (!others.length) return []
  return [...adoptMe(registry, others), ...adoptPeople(registry, others)]
}

function adoptMe(registry: Registry, others: OtherMe[]): MeField[] {
  const newest = others.filter((o) => o.meAt).sort((a, b) => time(b.meAt) - time(a.meAt))[0]
  if (newest && time(newest.meAt) > time(registry.meAt)) {
    const changed: MeField[] = []
    if (newest.authors.length && JSON.stringify(newest.authors) !== JSON.stringify(registry.authors)) changed.push('authors')
    if (newest.gitIdentity && JSON.stringify(newest.gitIdentity) !== JSON.stringify(registry.gitIdentity)) changed.push('gitIdentity')
    registry.adoptMe({ ...(newest.authors.length && { authors: newest.authors }), ...(newest.gitIdentity && { gitIdentity: newest.gitIdentity }), meAt: newest.meAt })
    return changed
  }
  if (registry.meAt) return []
  // 고친 때가 없는 예전 설정: 비어 있는 칸만 채운다
  const authors = registry.authors.length ? undefined : others.find((o) => o.authors.length)?.authors
  const gitIdentity = registry.gitIdentity ? undefined : others.find((o) => o.gitIdentity)?.gitIdentity
  if (!authors && !gitIdentity) return []
  registry.adoptMe({ ...(authors && { authors }), ...(gitIdentity && { gitIdentity }) })
  return [...(authors ? ['authors' as const] : []), ...(gitIdentity ? ['gitIdentity' as const] : [])]
}

/**
 * 사람 목록: 더 늦게 고친 컴퓨터의 목록을 통째로 따른다(지운 사람도 지워진다).
 * 이 컴퓨터가 한 번도 고친 때를 적지 않았으면(예전 설정) 이 컴퓨터에만 있던 사람은 남긴다(합치기).
 * 고친 때가 없는 예전 설정끼리는 서로의 목록을 합친다.
 */
function adoptPeople(registry: Registry, others: OtherMe[]): MeField[] {
  const mine = registry.people
  const merge = (...lists: Person[][]) => normalizePeople(lists.flat())
  const newest = others.filter((o) => o.peopleAt).sort((a, b) => time(b.peopleAt) - time(a.peopleAt))[0]
  let next: Person[] | undefined, at: string | undefined
  if (newest && time(newest.peopleAt) > time(registry.peopleAt)) {
    if (registry.peopleAt) [next, at] = [newest.people, newest.peopleAt]
    else {
      next = merge(newest.people, mine)
      // 이 컴퓨터에만 있던 사람을 더했으면 고친 때를 그쪽보다 늦게 적는다: 같은 때로 적으면 그쪽이 합친 목록을 받지 않고, 다음에 그쪽 목록을 통째로 따를 때 그 사람이 지워진다
      at = JSON.stringify(next) === JSON.stringify(merge(newest.people)) ? newest.peopleAt : new Date(Math.max(Date.now(), time(newest.peopleAt) + 1)).toISOString()
    }
  }
  else if (!registry.peopleAt) next = merge(mine, ...others.filter((o) => !o.peopleAt).map((o) => o.people))
  if (!next) return []
  const same = JSON.stringify(next) === JSON.stringify(mine)
  if (same && !at) return []
  registry.adoptMe({ people: next, ...(at && { peopleAt: at }) })
  return same ? [] : ['people']
}

/** 다른 컴퓨터에 적어 둔 논문 PDF 폴더 가운데 이 컴퓨터에도 있고 아직 더하지 않은 것 (설정 › 라이브러리가 「＋ 추가」로 보인다) */
export function otherPdfFolders(dir: string | undefined, mine: string[], exists = (p: string) => { try { return fs.statSync(p).isDirectory() } catch { return false } }, machine = machineName()): string[] {
  if (!dir) return []
  const seen = new Set(mine)
  return [...new Set(otherMachineMe(dir, machine).flatMap((o) => o.pdfFolders))].filter((p) => !seen.has(p) && exists(p))
}
