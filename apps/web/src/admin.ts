// 관리자 앱인지 (11/13 사용자 "관리자가 아니면 비활성화"): 피드백을 직접 받는 앱이 관리자다.
// 설치판처럼 피드백을 관리자의 중계 서버로 보내는 앱에서는 관리자만 쓰는 칸(피드백 처리 · 앱 고치기 · 앱 사본 업데이트)을 감춘다.
// 앱 고치기 · 에이전트에게 맡기기 · 피드백 가져오기는 서버가 앱 저장소 · 개인 저장소가 있을 때만 켠다(agentChats · feedback 라우트).
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { qk } from './queries'

/** 읽기 전에는 false: 관리자 칸이 잠깐 보였다 사라지지 않게 */
export function useAdmin(): boolean {
  return useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.admin ?? false
}
