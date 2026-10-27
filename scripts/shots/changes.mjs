// 변경사항 화면(info-changes)을 찍으려고 예제 연구를 git 저장소로 만들고 며칠에 걸친 커밋과 커밋 안 된 고침, 에이전트가 받은 때를 넣는다.
// 다른 화면은 git이 없는 예제로 찍으므로 화면 목록 맨 끝에서만 부른다 (screens.mjs)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HOUR = 3_600_000
/** 지금에서 h시간 전 (분은 고정해 그림의 시각이 덜 흔들리게: 정각) */
const ago = (h) => { const d = new Date(Date.now() - h * HOUR); d.setMinutes(0, 0, 0); return d.toISOString() }

export function seedChanges(repo, configDir, rid) {
  const git = (args, env = {}) => execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, ...env }, stdio: 'pipe' })
  const commit = (msg, name, when) => {
    git(['add', '-A'])
    git(['commit', '-q', '--allow-empty', '-m', msg], { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: 'sample@example.org', GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: 'sample@example.org', GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when })
  }
  const touch = (rel, text) => fs.appendFileSync(path.join(repo, rel), text)
  git(['init', '-q', '-b', 'main'])
  commit('예제 연구', 'Ada E. Example', ago(24 * 20))
  // 사흘 전 · 이틀 전: 노트 하나를 이틀에 걸쳐 고침 (작성일시가 범위로 보인다)
  touch('workbench/notes/kempe-chains/main.tex', '\n% 사례 하나 더\n')
  commit('Kempe 노트 사례', 'Ada E. Example', ago(24 * 3))
  touch('workbench/notes/kempe-chains/main.tex', '\n% 사례 정리\n')
  commit('Kempe 노트 정리', 'Ada E. Example', ago(24 * 2))
  // 어제: Codex가 맡긴 일 결과와 흐름 점
  touch('workbench/tasks/2026-10-07-five-color-check.md', '\n')
  touch('workbench/flow/degree-bound.yaml', '\n')
  commit('다섯 색 확인 결과', 'codex', ago(26))
  // 오늘: 기록 · 노트 하나 새로 (커밋), 이 맥에서 커밋 안 한 노트 고침
  touch('workbench/comments/project.md', '\n')
  commit('기록', 'Ada E. Example', ago(5))
  touch('workbench/topics/coloring/discharging/main.tex', '\n% 방전 규칙 다시\n')
  // 에이전트가 받은 때: Claude는 이틀 전 노트 뒤에, Codex는 어제 결과 뒤에
  const file = path.join(configDir, 'changes-seen.json')
  fs.writeFileSync(file, `${JSON.stringify({ 'claude-code:sample-account': { [rid]: ago(30) }, codex: { [rid]: ago(20) } }, null, 1)}\n`)
}
