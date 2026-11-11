import * as screenLayout from './project/screen-layout'
import * as overview from './project/overview'
import * as projectInfo from './project/project-info'
import * as workAndRecords from './project/work-and-records'
import * as edits from './project/edits'
import * as flow from './project/flow'
import type { AboutPart } from './types'

// 소개 › 프로젝트 화면 (#/about/project). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'project', title: '프로젝트 화면',
  sub: '프로젝트 하나를 열었을 때의 화면입니다. 무엇을 하는 연구이고, 어디까지 왔고, 다음에 무엇을 하는지를 한곳에서 봅니다.',
  sections: [screenLayout.ko, overview.ko, projectInfo.ko, workAndRecords.ko, edits.ko, flow.ko],
}

export const en: AboutPart = {
  id: 'project', title: 'Project screen',
  sub: 'The screen you see when you open one project. In one place you see what the research is about, how far it has come, and what comes next.',
  sections: [screenLayout.en, overview.en, projectInfo.en, workAndRecords.en, edits.en, flow.en],
}
