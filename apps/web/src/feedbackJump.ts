import { t } from './i18n'
/**
 * 피드백 › 그 자리로 가기 (10/4 19:21 "피드백에 해당하는 요소로 이동할 수 있는 링크"):
 * 피드백 항목의 화면(#/…)을 열고, 부위 이름(피드백 모드의 uiPath: "네트워킹 › 사람 페이지 › 분야 이름표")과
 * data-ui 줄이 맞는 요소를 찾아 보이게 굴린 뒤 잠깐 칠한다. 못 찾으면 화면만 열고 짧게 알린다.
 */

export interface UiSeg { name: string; item?: string }

const ITEM_CLIP = 24
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** "피드백 › 피드백 묶음 “지식” › 피드백 항목 “18:10 …”" → [{name:'피드백'}, {name:'피드백 묶음', item:'지식'}, …] */
export function parseUiPath(target: string): UiSeg[] {
  // 항목 이름 안의 ›(“14:44 사이드바 › 개념노트 목록”)에서 자르지 않게 따옴표 밖의 ›에서만 나눈다
  const parts: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < target.length; i++) {
    const c = target[i]!
    if (c === '“') quoted = true
    else if (c === '”') quoted = false
    if (!quoted && target.startsWith(' › ', i)) { parts.push(cur); cur = ''; i += 2; continue }
    cur += c
  }
  parts.push(cur)
  return parts.map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?) “(.*)”$/.exec(s)
    return m ? { name: m[1]!, item: m[2]! } : { name: s }
  })
}

/** 한 칸이 맞는가. 항목 이름은 피드백 모드가 24자로 줄여 적으므로 같은 방법으로 줄여 비교한다 */
const segMatch = (want: UiSeg, have: UiSeg) =>
  want.name === have.name && (want.item === undefined || (have.item !== undefined && clip(have.item, ITEM_CLIP) === want.item))

/**
 * 요소의 data-ui 줄(바깥 → 안)이 찾는 부위와 얼마나 맞는가. 맨 안쪽(마지막 칸)이 맞아야 하고,
 * 거기서부터 바깥으로 차례로 맞는 칸 수를 센다 (중간에 끼어든 부위는 건너뛴다). 안 맞으면 0
 */
export function chainScore(chain: UiSeg[], want: UiSeg[]): number {
  if (!chain.length || !want.length || !segMatch(want[want.length - 1]!, chain[chain.length - 1]!)) return 0
  let score = 1
  let i = chain.length - 2
  for (let w = want.length - 2; w >= 0 && i >= 0; w--) {
    let j = i
    while (j >= 0 && !segMatch(want[w]!, chain[j]!)) j--
    if (j < 0) continue
    score++
    i = j - 1
  }
  return score
}

function chainOf(el: Element): UiSeg[] {
  const out: UiSeg[] = []
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const name = cur.getAttribute('data-ui')
    if (!name) continue
    const item = cur.getAttribute('data-ui-item')
    out.push(item ? { name, item } : { name })
  }
  return out.reverse()
}

const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 }

/** 화면에서 부위 찾기. 마지막 칸이 없으면 바깥 칸으로 물러나 가장 가까운 부위를 찾는다 (exact: 마지막 칸을 찾았는가) */
export function findUiElement(target: string, root: ParentNode = document): { el: Element; exact: boolean } | null {
  const want = parseUiPath(target)
  for (let end = want.length; end > 0; end--) {
    const part = want.slice(0, end)
    const leaf = part[part.length - 1]!
    const exact = end === want.length
    let best: Element | null = null
    let bestScore = 0
    for (const el of root.querySelectorAll(`[data-ui="${CSS.escape(leaf.name)}"]`)) {
      if (!visible(el)) continue
      const chain = chainOf(el)
      // 바깥 칸으로 물러날 때는 같은 화면(맨 바깥 칸이 같은 것) 안에서만 찾고 (홈 › 할 일 → 왼쪽 띠의 "홈" 버튼이 아니게),
      // 화면 대부분을 덮는 부위(화면 전체)는 칠해도 도움이 안 되니 쓰지 않는다
      if (!exact) {
        const r = el.getBoundingClientRect()
        if (!chain[0] || !segMatch(want[0]!, chain[0]) || r.width * r.height > 0.5 * innerWidth * innerHeight) continue
      }
      const s = chainScore(chain, part)
      if (s > bestScore) { best = el; bestScore = s }
    }
    if (best) return { el: best, exact }
  }
  return null
}

function notice(text: string) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.setAttribute('data-feedback-ui', '')
  el.textContent = text
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  window.setTimeout(() => { el.classList.remove('show'); window.setTimeout(() => el.remove(), 300) }, 3000)
}

function highlight(el: Element) {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('ui-jump')
  void (el as HTMLElement).offsetWidth
  el.classList.add('ui-jump')
  window.setTimeout(() => el.classList.remove('ui-jump'), 2400)
}

/** 피드백 모드의 #/…와 소개에서 남긴 /… 주소를 같은 화면 주소로 맞춘다. */
export function feedbackRoute(route: string | undefined): string {
  if (route?.startsWith('#')) return route
  return route?.startsWith('/') ? `#${route}` : '#/'
}

/** 화면을 열고 부위를 찾을 때까지 잠깐 기다린다 (화면이 자료를 불러오는 동안) */
export function jumpToFeedbackTarget(route: string | undefined, target: string): void {
  const hash = feedbackRoute(route)
  if (location.hash !== hash) location.hash = hash
  const started = Date.now()
  const tryFind = () => {
    const found = findUiElement(target)
    if (found?.exact) { highlight(found.el); return }
    if (Date.now() - started < 3000) { window.setTimeout(tryFind, 150); return }
    if (found) { highlight(found.el); notice(t(`그 부위는 지금 화면에 없어 가까운 곳을 보여 줍니다: ${chainOf(found.el).map((s) => s.name).join(' › ')}`, `That part is not on this screen now, so the nearest one is shown: ${chainOf(found.el).map((s) => s.name).join(' › ')}`)) }
    else notice(t('화면은 열었지만 그 부위를 찾지 못했습니다. 화면이 바뀌었거나 접혀 있을 수 있습니다', 'Opened the screen but could not find that part. The screen may have changed or the part may be collapsed.'))
  }
  window.setTimeout(tryFind, 100)
}
