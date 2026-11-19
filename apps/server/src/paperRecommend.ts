import path from 'node:path'
import YAML from 'yaml'
import type { PaperInterests, PaperPick, PaperRecommend, PaperRow } from '@rw/core/contract/papers'
import { paperFetch } from './paperAdd.js'
import { libraryKeys, s2Hit, type S2Hit, type S2Paper } from './paperIds.js'
import { fileCache } from './readCache.js'
import { editYaml, matchesSubject, readSubjects, readYamlHash, subjectLabel } from './subjects.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 추천 논문 (논문 첫 화면 오른쪽 아래, 10/31 시안 1절).
 * 기준: 이 맥에서 최근 연 논문, 없으면 최근 더한 논문 가운데 arXiv 번호나 DOI가 있는 것 몇 편.
 * 기준 논문마다 따로 Semantic Scholar 추천(최근 논문 모음)에 묻고, 기준마다 가까운 순서대로 번갈아 하나씩 고른다.
 * 여러 편을 한 번에 물으면(positivePaperIds) 주제가 섞인 평균에 가까운 논문이 와 내 논문과 무관한 것이 추천되고,
 * 날짜순으로 다시 늘어놓으면 가까운 순서가 사라진다 (11/19 피드백: 무관한 논문 추천).
 * 라이브러리에 이미 있는 것은 뺀다(arXiv 번호 · DOI 어느 쪽이 겹쳐도, paperIds.ts).
 * 관심 분야(11/20 피드백): 라이브러리 분류를 골라 두면(shared-library/recommend.yaml interests:) 그 분류(하위 포함)의 논문만 기준으로 삼고,
 * 분류마다 번갈아 기준을 고른다. 각 추천에는 어느 분류의 기준에서 왔는지(from)를 붙인다. 고르지 않았으면 위와 같다.
 * 같은 기준(순서는 상관없음)이면 몇 시간 동안 다시 묻지 않고, 받지 못했으면 몇 분 동안 다시 묻지 않는다 (첫 화면을 열 때마다 바깥에 묻지 않게).
 */

const SEEDS = 6
const PICKS = 6
const KEEP_MS = 6 * 3_600_000
/** 받지 못했을 때(연결 없음 · 429 같은 오류) 다시 묻기까지 */
const RETRY_MS = 5 * 60_000
/** 기준 하나에 받는 수 (라이브러리에 있는 것을 빼고도 남게) */
const PER_SEED = 10
const urlFor = (seed: string) => `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURI(seed)}?from=recent&limit=${PER_SEED}&fields=title,authors,year,venue,externalIds,publicationDate`

const s2Id = (p: PaperRow) => (p.eprint ? `ArXiv:${p.eprint.replace(/v\d+$/, '')}` : p.doi ? `DOI:${p.doi}` : null)

interface Seed { id: string; from?: string }
/** 기준 논문: 연 순, 그다음 더한 순. 관심 분야가 있으면 분야마다 그 순서로 늘어놓고 번갈아 하나씩 (같은 논문은 처음 나온 분야에만) */
export function seedsOf(papers: PaperRow[], interests: readonly string[] = []): Seed[] {
  const sorted = [...papers].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0) || b.added - a.added)
  const ids = (list: PaperRow[]) => list.map(s2Id).filter((x): x is string => !!x)
  if (!interests.length) return ids(sorted).slice(0, SEEDS).map((id) => ({ id }))
  const lists = interests.map((from) => ids(sorted.filter((p) => matchesSubject(p.subjects, from))).map((id) => ({ id, from })))
  const out: Seed[] = [], seen = new Set<string>()
  for (let i = 0; out.length < SEEDS && lists.some((l) => i < l.length); i++)
    for (const l of lists) {
      const x = l[i]
      if (!x || seen.has(x.id) || out.length >= SEEDS) continue
      seen.add(x.id)
      out.push(x)
    }
  return out
}

const interestsFile = (lib: string) => path.join(lib, 'recommend.yaml')
/** recommend.yaml을 읽지 못하면 고르지 않은 것으로 본다 (추천 절이 깨지지 않게) */
const cachedInterests = fileCache((raw): unknown[] => { try { const v = (YAML.parse(raw) as { interests?: unknown } | null)?.interests; return Array.isArray(v) ? v : [] } catch { return [] } })
/** 관심 분야: 분류 나무가 없으면 undefined. 나무에서 사라진 분류는 뺀다 */
export function readInterests(lib: string | undefined): PaperInterests | undefined {
  const tree = readSubjects(lib)
  if (!lib || !tree.enabled) return undefined
  const file = interestsFile(lib)
  const hash = readYamlHash(file)
  let raw: unknown[] = []
  try { raw = cachedInterests(file) } catch { /* 파일 없음 */ }
  const chosen = [...new Set(raw.filter((id): id is string => typeof id === 'string' && tree.items.some((s) => s.id === id)))]
  const choices = [...tree.items.filter((s) => !s.parent).map((s) => s.id), ...chosen.filter((id) => id.includes('/'))]
  return { chosen, choices: choices.map((id) => ({ id, name: subjectLabel(tree, id) })), hash }
}
export function setInterests(lib: string | undefined, value: string[], baseHash: string): PaperInterests {
  const tree = readSubjects(lib)
  if (!lib || !tree.enabled) throw new WorkbenchError(409, t('분류 나무를 먼저 마련해 주세요', 'Set up the subject tree first'))
  if (value.length > 12 || new Set(value).size !== value.length || value.some((id) => !tree.items.some((s) => s.id === id))) throw new WorkbenchError(400, t('나무에 있는 분류를 12개까지 골라 주세요', 'Choose up to 12 subjects from the tree'))
  editYaml(interestsFile(lib), baseHash, (doc) => doc.set('interests', doc.createNode(value)))
  return readInterests(lib)!
}

class HttpError extends Error { constructor(readonly status: number) { super(`HTTP ${status}`) } }

/** 기준마다 받은 목록(가까운 순)을 첫째끼리, 둘째끼리 … 번갈아 이어 붙인다. 같은 논문은 처음 나온 자리에만 */
export function interleave<T extends S2Hit>(lists: T[][]): T[] {
  const out: T[] = [], seen = new Set<string>()
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++)
    for (const l of lists) {
      const x = l[i]
      if (!x || x.keys.some((k) => seen.has(k))) continue
      x.keys.forEach((k) => seen.add(k))
      out.push(x)
    }
  return out
}

/** 마지막으로 물은 기준과 그 답. failed면 받지 못한 것(status = 바깥이 오류로 답한 HTTP 상태) */
let kept: { seeds: string; at: number; picks: Pick[]; failed?: { status?: number } } | null = null
/** 테스트가 저장해 둔 결과를 비운다 */
export function forgetRecommendations(): void { kept = null }

type Pick = S2Hit & { from?: string }

/** interests = readInterests의 답 (분류 나무가 있을 때만): 고른 분야로 기준을 고르고, 답에도 그대로 실어 화면이 칩을 그린다 */
export async function recommendPapers(papers: PaperRow[], now = Date.now(), interests?: PaperInterests): Promise<PaperRecommend> {
  const seeds = seedsOf(papers, interests?.chosen)
  const also = interests ? { interests } : {}
  if (!seeds.length) return { picks: [], seeds: 0, offline: false, ...also }
  const have = libraryKeys(papers)
  const fresh = (list: Pick[]): PaperPick[] => list.filter((x) => !x.keys.some((k) => have.has(k))).slice(0, PICKS)
    .map((x) => ({ id: x.id, title: x.title, authors: x.authors, ...(x.year && { year: x.year }), ...(x.venue && { venue: x.venue }), ...(x.date && { date: x.date }), ...(x.from && { from: x.from }) }))
  const failed = (status?: number): PaperRecommend => ({ picks: [], seeds: seeds.length, offline: true, ...(status && { status }), ...also })
  const key = seeds.map((x) => `${x.id}@${x.from ?? ''}`).sort().join(' ')
  if (kept && kept.seeds === key) {
    if (kept.failed && now - kept.at < RETRY_MS) return failed(kept.failed.status)
    if (!kept.failed && now - kept.at < KEEP_MS) return { picks: fresh(kept.picks), seeds: seeds.length, offline: false, ...also }
  }
  try {
    const answers = await Promise.allSettled(seeds.map(async ({ id: seed, from }): Promise<Pick[]> => {
      const res = await paperFetch(urlFor(seed))
      // 404: Semantic Scholar가 이 기준 논문을 모른다. 그 기준만 건너뛴다
      if (res.status === 404) return []
      if (!res.ok) throw new HttpError(res.status)
      const body: { recommendedPapers?: S2Paper[] } = await res.json()
      return (body.recommendedPapers ?? []).flatMap((p) => { const x = s2Hit(p); return x ? [{ ...x, ...(from && { from }) }] : [] })
    }))
    const got = answers.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []))
    if (!got.length) {
      const why = answers.find((x): x is PromiseRejectedResult => x.status === 'rejected')?.reason
      const status = why instanceof HttpError ? why.status : undefined
      kept = { seeds: key, at: now, picks: [], failed: { ...(status && { status }) } }
      return failed(status)
    }
    const picks = interleave(got)
    kept = { seeds: key, at: now, picks }
    return { picks: fresh(picks), seeds: seeds.length, offline: false, ...also }
  } catch {
    kept = { seeds: key, at: now, picks: [], failed: {} }
    return failed()
  }
}
