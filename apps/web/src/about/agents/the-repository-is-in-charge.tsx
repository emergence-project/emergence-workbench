import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › agents › 저장소가 주인. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '저장소가 주인',
  items: [
    { text: <>앱이 만드는 것은 각 저장소의 {c('workbench/')} 한 폴더뿐입니다. 그 프로젝트가 이미 가진 정본(원고, 작업 목록, bib, 자료 폴더, 검토 문서)은 {c('research.yaml')}의 {c('sources:')}에 적어 그 자리에서 읽습니다.</> },
    { text: <>앱은 고치지 않은 부분의 바이트를 바꾸지 않습니다. 파일이 바깥에서 바뀌면 알아채 다시 읽고, 저장이 부딪히면 덮어쓰지 않고 알립니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'The repository is in charge',
  items: [
    { text: <>The only thing the app creates is one folder, {c('workbench/')}, in each repository. The sources of truth a project already has (manuscript, task list, bib, materials folder, review documents) are listed under {c('sources:')} in {c('research.yaml')} and read where they are.</> },
    { text: <>The app does not change the bytes of parts it did not edit. When a file changes outside, it notices and rereads it, and when saves collide it tells you instead of overwriting.</> },
  ],
}
