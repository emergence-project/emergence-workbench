import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { store } from './store'

/**
 * 폰 화면 (10/30 사용자 결정 "Tailscale, 읽기와 답·메모"): 폭 600px 아래에서는 레일이 아래 탭 바가 되고(styles/phone.css),
 * 사이드바와 오른쪽 사이드바는 본문을 덮는 한 장이 된다. 그래서 처음에는 닫아 두고, 다른 화면으로 가면 다시 닫는다.
 * 폰 브라우저의 열림 기록은 그 폰에만 남으므로 맥의 열림과 섞이지 않는다.
 */
export const PHONE_QUERY = '(max-width: 600px)'

/** 폰으로 처음 열면 내 차례부터 (10/31 "안 A · 내 차례 먼저"). 주소가 비었을 때만: 링크로 연 화면은 그대로. 앱이 주소를 읽기 전에 부른다 */
export function phoneStart(): void {
  if (matches() && (!location.hash || location.hash === '#' || location.hash === '#/')) history.replaceState(history.state, '', '#/turns')
}

const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches

export function usePhone(): boolean {
  const [phone, setPhone] = useState(matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const q = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return phone
}

/** 폰이면 처음과 화면을 옮길 때마다 close를 부른다 (routeKey가 바뀔 때) */
export function usePhoneCloses(phone: boolean, routeKey: string, close: () => void): void {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => { if (phone) latest.current() }, [phone, routeKey])
}

/** 이 브라우저에 기억하는 열림 · 닫힘 (store.ts) */
export function useStoredFlag(key: string, fallback: boolean): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [v, setV] = useState<boolean>(() => store.get(key, fallback))
  useEffect(() => store.set(key, v), [key, v])
  return [v, setV]
}
