/**
 * 공유 라이브러리 API의 계약 (research-library, 서버 routes/library.ts · 화면 api/library.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 라이브러리 노트를 쓰는 프로젝트 노트 하나 */
export const LibraryUse = z.object({ rid: z.string(), project: z.string(), note: z.string().optional(), noteTitle: z.string().optional() }).strict()

export type LibraryUse = z.infer<typeof LibraryUse>
