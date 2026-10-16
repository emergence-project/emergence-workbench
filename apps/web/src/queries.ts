import { QueryClient, type QueryKey } from '@tanstack/react-query'
import type { WorkbenchEvent } from './api'

/**
 * 화면 캐시 (2026-10-15 종합 검토 묶음 H, TanStack Query).
 * 자료마다 키를 두고, 서버의 파일 알림(WorkbenchEvent)은 그 알림이 바꾸는 자료의 키만 다시 받게 한다(invalidationKeys).
 * 서버가 바뀔 때마다 알려 주므로 받은 자료는 알림이 올 때까지 그대로 쓴다(staleTime 무한, 창 초점에 다시 받지 않음).
 * 아직 옮기지 않은 화면은 예전처럼 version(App.tsx)이 오를 때 다시 받는다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, gcTime: 10 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false },
  },
})

/** 자료의 키. 프로젝트 자료는 ['project', rid, 이름 …] */
export const qk = {
  researches: ['researches'] as const,
  library: ['library'] as const,
  project: (rid: string) => ['project', rid] as const,
  summary: (rid: string) => ['project', rid, 'summary'] as const,
  notes: (rid: string) => ['project', rid, 'notes'] as const,
  topics: (rid: string) => ['project', rid, 'topics'] as const,
  manuscripts: (rid: string) => ['project', rid, 'manuscripts'] as const,
  journal: (rid: string, days: number) => ['project', rid, 'journal', days] as const,
  sync: (rid: string) => ['project', rid, 'sync'] as const,
}

/**
 * 알림 하나가 바꾸는 자료 (키 앞부분: 그 키로 시작하는 자료를 모두 다시 받는다).
 * 서버 쪽의 같은 표는 app.ts broadcast의 캐시 비우기(B 묶음)다.
 */
export function invalidationKeys(e: WorkbenchEvent): QueryKey[] {
  if (e.type === 'library') return [qk.library]
  const rid = e.research
  switch (e.type) {
    // research.yaml(제목 · 주제 · 원고 선언 …)이 바뀌면 그 프로젝트의 모든 자료와 프로젝트 목록
    case 'research': return [qk.project(rid), qk.researches]
    // 블록 노트: 요약(블록 줄 · 나무), 노트 목록(블록 노트 줄), 주제 카드 수, 라이브러리의 "쓰는 곳"
    case 'block': return [qk.summary(rid), qk.notes(rid), qk.topics(rid), qk.library]
    // 노트 파일: 노트 목록 · 주제 카드 수 · 원고(노트도 원고일 수 있다) · 라이브러리의 "쓰는 곳"
    case 'note': return [qk.notes(rid), qk.topics(rid), qk.manuscripts(rid), qk.library]
    case 'statement': return [qk.summary(rid)]
    // 기록: 요약의 할 일
    case 'comments': return [qk.summary(rid)]
    case 'journal': return [['project', rid, 'journal']]
    // research.yaml sources의 파일(원고 · 그림 · 참고 자료)
    case 'sources': return [qk.manuscripts(rid)]
    case 'preamble': case 'tasks': case 'flow': case 'records-publish': return []
  }
}

/**
 * 알림은 몰려서 온다(저장 한 번, 에이전트가 파일 여러 개를 한꺼번에 바꿀 때). 잠깐(0.4초) 모은 키를 한 번에 다시 받는다.
 * 같은 키가 겹치면 한 번만.
 */
export function batchInvalidation(client: QueryClient, wait = 400) {
  let pending: QueryKey[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    timer = undefined
    const keys = pending
    pending = []
    const seen = new Set<string>()
    for (const key of keys) {
      const id = JSON.stringify(key)
      if (seen.has(id)) continue
      seen.add(id)
      void client.invalidateQueries({ queryKey: key })
    }
  }
  return {
    add(keys: QueryKey[]) {
      if (!keys.length) return
      pending.push(...keys)
      clearTimeout(timer)
      timer = setTimeout(flush, wait)
    },
    cancel() { clearTimeout(timer); pending = [] },
  }
}
