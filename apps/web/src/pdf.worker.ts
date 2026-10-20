// PDF 작업자: 오래된 브라우저에 없는 함수를 먼저 채우고 pdf.js 작업자를 읽는다 (pdfjs.ts가 이 파일을 작업자로 띄운다)
import './polyfills'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
