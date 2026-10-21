import { t as tr } from '../i18n'
import { agentName } from '../taskView'

/** 점을 만든 이의 화면 이름: user는 "사용자", 에이전트는 맡긴 일과 같은 이름 (10/21) */
export const flowBy = (by: string) => by === 'user' ? tr('사용자', 'User') : agentName(by)
