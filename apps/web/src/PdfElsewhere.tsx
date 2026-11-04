import { t } from './i18n'

/** PDF가 없는 논문을 찾아갈 링크: DOI → 출판사 페이지, 없으면 Google Scholar에서 제목으로 찾기 */
export function PdfElsewhere({ doi, title }: { doi?: string; title: string }) {
  return doi
    ? <a className="a" href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer" title={`doi.org/${doi}`}>{t('출판사에서 보기', 'View at publisher')}</a>
    : <a className="a" href={`https://scholar.google.com/scholar?q=${encodeURIComponent(title.replace(/[{}]/g, ''))}`} target="_blank" rel="noreferrer">{t('Scholar에서 찾기', 'Find on Scholar')}</a>
}
