import { ElementPicker } from './elementPicker'
import { t } from './i18n'

/** 가리킨 화면 부위 (피드백 모드와 같은 부위 이름) */
export interface PointedPart { part: string; partText: string }

/**
 * 기록의 가리키기 (10/15 피드백: 피드백 모드처럼 기록이 화면 어디에 대한 것인지 남긴다).
 * 켜져 있는 동안 화면 부위(data-ui)에 마우스를 올리면 이름표가 뜨고, 누르면 그 부위 이름과 글자를 돌려준다.
 * 고르기는 elementPicker.tsx. Esc나 아래 막대의 취소로 끈다.
 */
export function RecordPointer({ onPick, onCancel }: { onPick(p: PointedPart): void; onCancel(): void }) {
  return <ElementPicker title={t('가리키기', 'Point')} hint={t('기록이 가리킬 화면 한 곳을 누르세요 · Esc 취소', 'Click the part of the screen this record is about · Esc to cancel')}
    onPick={(p) => onPick({ part: p.path, partText: p.snippet })} onCancel={onCancel} />
}
