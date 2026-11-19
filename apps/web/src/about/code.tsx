/** 소개 글 안의 짧은 코드 (파일 경로 등) */
export const c = (s: string) => <code>{s}</code>

/** 이식 안내서 docs/ports/<이름>.md의 주소 (저장소가 공개라 GitHub에서 연다) */
export const portUrl = (name: string) => `https://github.com/emergence-project/emergence-workbench/blob/main/docs/ports/${name}.md`
