// React hooks 규칙만 검사한다 (pnpm test). 다른 규칙은 넣지 않는다: 모양은 tsc와 check-design이 본다.
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]
