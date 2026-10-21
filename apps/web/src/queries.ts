import { QueryClient, type QueryKey } from '@tanstack/react-query'
import type { WorkbenchEvent } from './api'
import { LIBRARY_RID } from '@rw/core'

/**
 * 화면 캐시 (2026-10-15 종합 검토 묶음 H, TanStack Query).
 * 자료마다 키를 두고, 서버의 파일 알림(WorkbenchEvent)은 그 알림이 바꾸는 자료의 키만 다시 받게 한다(invalidationKeys).
 * 서버가 바뀔 때마다 알려 주므로 받은 자료는 알림이 올 때까지 그대로 쓴다(staleTime 무한, 창 초점에 다시 받지 않음).
 * 아직 옮기지 않은 화면(노트 · 블록 편집, 규칙 파일, 저장소 상태, 고침 하나의 검토)은 예전처럼 version(App.tsx)이 오를 때 다시 받는다.
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
  /** 프로젝트 정보: research.yaml sources · 작업 목록 · 검토 문서 */
  info: (rid: string) => ['project', rid, 'info'] as const,
  materials: (rid: string) => ['project', rid, 'materials'] as const,
  /** 기록 글 속 저장소 경로 하나 (찾기만 · 내용까지) */
  repoFile: (rid: string, path: string, body: boolean) => ['project', rid, 'file', path, body] as const,
  /** 기록 글 속 저장소 경로 전부: 노트 · 블록 · sources 파일이 바뀌면 다시 찾는다 */
  repoFiles: (rid: string) => ['project', rid, 'file'] as const,
  /** 프로젝트 정보 › 파일의 목록 (repoFiles 아래라 노트 · sources가 바뀌면 함께 다시 받는다) */
  repoTree: (rid: string) => ['project', rid, 'file', ''] as const,
  /** 맡긴 일 (workbench/tasks/*.md) */
  tasks: (rid: string) => ['project', rid, 'tasks'] as const,
  /** STATUS.md와 같은 현황 글: 프로젝트의 거의 모든 파일에서 뽑으므로 그 프로젝트의 알림마다 다시 받는다 */
  status: (rid: string) => ['project', rid, 'status'] as const,
  /** 주제 카드와 그 수: 주제 키 아래에 두어 주제를 다시 받을 때 함께 */
  topicsOverview: (rid: string) => ['project', rid, 'topics', 'overview'] as const,
  /** 지운 노트: 노트 키 아래에 두어 노트를 다시 받을 때 함께 */
  noteTrash: (rid: string) => ['project', rid, 'notes', 'trash'] as const,
  /** 에이전트 고침 검토 목록. scope = 프로젝트 id 또는 library */
  agentEdits: (scope: string) => ['agent-edits', scope] as const,
  /** 흐름 점 · 자리 · 줄 (workbench/flow/) */
  flow: (rid: string) => ['project', rid, 'flow'] as const,
  /** 프로젝트와 모든 노트의 기록 (workbench/comments/). 인용 위치를 노트에서 다시 찾으므로 노트가 바뀌어도 다시 받는다 */
  records: (rid: string) => ['project', rid, 'records'] as const,
  /** 기록 올리기의 마지막 결과 (기록 탭 맨 위 줄 · 실패 알림). 서버가 실패가 생기거나 풀릴 때 records-publish로 알린다 */
  recordsPublish: (rid: string) => ['project', rid, 'records-publish'] as const,
  /** 안 올린 기록 파일 (git): 올리기 결과 키 아래에 두어 그 알림 때 함께. 기록 · 일지 파일이 바뀌면 이것만 */
  recordsUnpublished: (rid: string) => ['project', rid, 'records-publish', 'unpublished'] as const,
  papers: ['papers'] as const,
  /** 에이전트 대화 (앱 설정 폴더, 연구 저장소 밖). 지금 작업 상태(agentWork)는 모든 프로젝트 것 */
  agentChats: (rid: string) => ['agent-chats', rid] as const,
  agentWork: ['agent-work'] as const,
  /** 앱 피드백 (설정 폴더의 개인 저장소 사본. 프로젝트 알림과 상관없다) */
  feedback: ['feedback'] as const,
  /** 연구 공통 규칙 (설정 › 공통 규칙, 개인 저장소 사본. 프로젝트 알림과 상관없다) */
  commonRules: ['common-rules'] as const,
  /** 네트워킹 (사람 목록 · 등록 추천 · 사람 페이지). 사람 목록을 저장하면 이 키 전체를 다시 받는다 (network/people.tsx announce) */
  network: ['network'] as const,
  people: ['network', 'people'] as const,
  peopleSuggestions: ['network', 'suggestions'] as const,
  /** 사람 페이지 (참고 문헌의 논문 · 함께 쓴 사람 · 나오는 곳) */
  person: (id: string) => ['network', 'person', id] as const,
  /** 사람 페이지의 새 논문: 네트워킹 키 밖에 두어 사람 목록을 저장해도 다시 찾지 않는다. 이름 · S2 저자가 바뀌면 새 키 */
  personNewPapers: (id: string, s2: string, name: string) => ['person-new-papers', id, s2, name] as const,
  /** 원고 저자와 서식 (/api/latex-setup). 네트워킹의 노트 저자 · 사람 고치기 창이 읽는다 */
  latexSetup: ['latex-setup'] as const,
  /** 구글 연결 상태 (네트워킹의 "나"를 이메일로 찾는다) */
  googleStatus: ['google-status'] as const,
  /** 시작 준비 (설정 › 계정, 홈 카드) */
  setup: ['setup'] as const,
  /** GitHub 로그인으로 읽은 저장소 목록 (설정 › 계정, 홈의 시작 준비, 프로젝트 등록) */
  githubRepos: ['github-repos'] as const,
}

/**
 * 알림 하나가 바꾸는 자료 (키 앞부분: 그 키로 시작하는 자료를 모두 다시 받는다).
 * 서버 쪽의 같은 표는 app.ts broadcast의 캐시 비우기(B 묶음)다.
 */
export function invalidationKeys(e: WorkbenchEvent): QueryKey[] {
  // 라이브러리의 개념노트를 에이전트가 고치면 라이브러리 고침 검토도 바뀐다
  // 개념노트 기록(records)은 라이브러리 기록 모음만 다시 받는다 (10/18)
  if (e.type === 'library') return e.part === 'papers' ? [qk.library, qk.papers] : e.part === 'concepts' ? [qk.library, qk.agentEdits('library')] : e.part === 'records' ? [qk.records(LIBRARY_RID)] : [qk.library]
  // 에이전트 대화는 파일이 아니라 현황과 상관없다
  if (e.type === 'agent-chat') return [qk.agentChats(e.research), qk.agentWork]
  const keys = projectKeys(e)
  // research는 프로젝트 키 전체라 현황도 들어 있다
  return e.type === 'research' ? keys : [...keys, qk.status(e.research)]
}

/** 모든 사람 페이지 (qk.person(id)의 앞부분) */
const PERSON_PAGES: QueryKey = [...qk.network, 'person']

function projectKeys(e: Exclude<WorkbenchEvent, { type: 'library' | 'agent-chat' }>): QueryKey[] {
  const rid = e.research
  switch (e.type) {
    // research.yaml(제목 · 주제 · 원고 선언 …)이 바뀌면 그 프로젝트의 모든 자료와 프로젝트 목록
    case 'research': return [qk.project(rid), qk.researches, qk.agentEdits(rid)]
    // 블록 노트: 요약(블록 줄 · 나무), 노트 목록(블록 노트 줄), 주제 카드 수, 라이브러리의 "쓰는 곳", 고침 검토(에이전트가 고친 노트)
    case 'block': return [qk.summary(rid), qk.notes(rid), qk.topics(rid), qk.library, qk.agentEdits(rid), qk.records(rid), qk.repoFiles(rid)]
    // 노트 파일: 노트 목록 · 주제 카드 수 · 원고(노트도 원고일 수 있다) · 라이브러리의 "쓰는 곳" · 고침 검토
    case 'note': return [qk.notes(rid), qk.topics(rid), qk.manuscripts(rid), qk.library, qk.agentEdits(rid), qk.records(rid), qk.repoFiles(rid)]
    case 'statement': return [qk.summary(rid)]
    // 기록: 요약의 할 일과 기록 모음, 안 올린 기록 (일지도 올리는 기록이다)
    // 사람 페이지의 "나오는 곳"이 기록에서 이름을 찾는다
    case 'comments': return [qk.summary(rid), qk.records(rid), qk.recordsUnpublished(rid), PERSON_PAGES]
    case 'journal': return [['project', rid, 'journal'], qk.recordsUnpublished(rid)]
    // research.yaml sources의 파일(원고 · 그림 · 참고 자료 · 작업 목록 · 검토 문서)
    // 프로젝트 bib는 네트워킹의 등록 추천과 사람 페이지(참고 문헌의 논문 · 나오는 곳)가 읽는다
    case 'sources': return [qk.manuscripts(rid), qk.materials(rid), qk.info(rid), qk.repoFiles(rid), qk.peopleSuggestions, PERSON_PAGES]
    case 'tasks': return [qk.tasks(rid)]
    case 'flow': return [qk.flow(rid)]
    case 'records-publish': return [qk.recordsPublish(rid)]
    case 'preamble': return []
  }
}

/**
 * 알림은 몰려서 온다(저장 한 번, 에이전트가 파일 여러 개를 한꺼번에 바꿀 때). 첫 알림은 바로 다시 받고,
 * 그 뒤 잠깐(0.4초) 동안 온 키는 모았다가 한 번에(겹침 없이) 다시 받는다.
 */
export function batchInvalidation(client: QueryClient, wait = 400) {
  let pending: QueryKey[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = (keys: QueryKey[]) => {
    const seen = new Set<string>()
    for (const key of keys) {
      const id = JSON.stringify(key)
      if (seen.has(id)) continue
      seen.add(id)
      void client.invalidateQueries({ queryKey: key })
    }
  }
  const close = () => {
    const keys = pending
    pending = []
    if (keys.length) { run(keys); timer = setTimeout(close, wait) } else timer = undefined
  }
  return {
    add(keys: QueryKey[]) {
      if (!keys.length) return
      if (timer === undefined) { run(keys); timer = setTimeout(close, wait) } else pending.push(...keys)
    },
    cancel() { clearTimeout(timer); timer = undefined; pending = [] },
  }
}
