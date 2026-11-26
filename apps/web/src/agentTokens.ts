/** 토큰 수: 1.2k · 48k · 1.3M */
export function tokensName(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** 맥락 크기와 요약하는 선: 87k / 167k (선을 모르는 에이전트는 크기만) */
export function contextName(c: { used: number; window: number; compactAt?: number }): string {
  return c.compactAt ? `${tokensName(c.used)} / ${tokensName(c.compactAt)}` : tokensName(c.used)
}
