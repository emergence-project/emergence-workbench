// 설치 파일로 깐 앱의 새 버전 알림 (11/8 사용자 "업데이트 릴리즈시 지금 앱과 동일하게 아이콘으로 알림이 떠?"):
// 이 앱은 git이 없어 스스로 받지 못하므로, GitHub 릴리스의 최신판을 몇 시간에 한 번 보고 지금 판보다 새로우면
// 레일의 새 버전 버튼(맥 앱과 같은 자리 · 같은 아이콘)이 뜨게 한다. 누르면 이 OS의 설치 파일을 받는다.
export const RELEASES_API = 'https://api.github.com/repos/emergence-project/emergence-workbench/releases/latest'
const TTL_MS = 6 * 60 * 60_000

export interface NewRelease { version: string; url: string; download: string | null }
export interface InstalledBuild { version?: string; builtAt: string }

/** "0.2.10" > "0.2.9": 점으로 나눈 수를 앞에서부터 비교 (숫자가 아닌 꼬리는 버린다) */
export function newerVersion(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

interface GhRelease { tag_name?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean; assets?: { name?: string; browser_download_url?: string }[] }

/** 이 OS에 맞는 설치 파일 */
const assetFor = (platform: NodeJS.Platform) => platform === 'win32' ? /x64-setup\.exe$/i : platform === 'darwin' ? /\.dmg$/i : /$^/

/**
 * 받은 최신 릴리스가 지금 판보다 새로운지. 지금 판의 번호가 없으면(태그 없이 만든 시험판) 만든 때보다 하루 넘게 뒤에 낸 릴리스만 새것으로 본다.
 */
export function pickNew(rel: GhRelease, installed: InstalledBuild, platform: NodeJS.Platform = process.platform): NewRelease | null {
  if (!rel.tag_name || !rel.html_url || rel.draft || rel.prerelease) return null
  const version = rel.tag_name.replace(/^v/, '')
  const newer = installed.version
    ? newerVersion(version, installed.version)
    : !!rel.published_at && !!installed.builtAt && Date.parse(rel.published_at) - Date.parse(installed.builtAt) > 24 * 60 * 60_000
  if (!newer) return null
  const asset = rel.assets?.find((a) => a.name && assetFor(platform).test(a.name))
  return { version, url: rel.html_url, download: asset?.browser_download_url ?? null }
}

/** 몇 시간에 한 번만 GitHub에 묻는다. 묻지 못하면 알림 없이 지나간다 (오프라인 · 한도) */
export function releaseChecker(installed: InstalledBuild, fetchFn: typeof fetch = fetch, now = () => Date.now()) {
  let last: { at: number; value: NewRelease | null } | null = null
  let pending: Promise<NewRelease | null> | null = null
  return (refresh: boolean): Promise<NewRelease | null> => {
    if (last && (!refresh || now() - last.at < TTL_MS)) return Promise.resolve(last.value)
    if (!refresh && !last) return Promise.resolve(null)
    pending ??= (async () => {
      try {
        const r = await fetchFn(RELEASES_API, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'emergence-workbench' }, signal: AbortSignal.timeout(15_000) })
        const body: GhRelease = r.ok ? await r.json() : {}
        const value = r.ok ? pickNew(body, installed) : last?.value ?? null
        last = { at: now(), value }
      } catch {
        last = { at: now(), value: last?.value ?? null }
      } finally { pending = null }
      return last.value
    })()
    return pending
  }
}
