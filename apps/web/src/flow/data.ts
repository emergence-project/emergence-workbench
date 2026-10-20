import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flowApi, type FlowScan } from '../api'
import { qk } from '../queries'

export type TopicRef = { id: string; title: string }

/** 흐름 자료 읽기 (화면 캐시 qk.flow: 흐름 파일 알림이 오면, 화면이 쓰면 다시 읽는다) */
const EMPTY: FlowScan = { nodes: [], diagnostics: [], layout: {}, rows: null }
export function useFlow(rid: string) {
  const client = useQueryClient()
  const { data } = useQuery({ queryKey: qk.flow(rid), queryFn: () => flowApi(rid).scan().catch(() => EMPTY) })
  const reload = useCallback(() => { void client.invalidateQueries({ queryKey: qk.flow(rid) }) }, [client, rid])
  return { scan: data ?? null, reload }
}
