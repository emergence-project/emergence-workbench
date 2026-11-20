import { t } from './i18n'

/** 공용 라이브러리 폴더를 정하는 곳(계정 › 공용 라이브러리)으로 가는 링크. 라이브러리가 없다는 안내마다 같은 곳을 가리키게 한 곳에 둔다 */
export function LibraryLink() {
  return <a className="a" href="#/account">{t('계정 › 공용 라이브러리', 'Account › Shared library')}</a>
}
