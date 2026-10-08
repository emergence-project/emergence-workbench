/**
 * 블록 제목(화면에 보이는 보통 글자)을 LaTeX 제목(\section{…})으로 옮긴다.
 * - `$…$`는 수식으로 그대로 둔다.
 * - 그 밖에서는 LaTeX 특수문자를 글자로 바꾸고, `{` `}` `\`는 뺀다.
 * - 그리스 문자와 위·아래 첨자 숫자는 본문 글꼴(Latin Modern)에 없어 조용히 빠지므로 수식으로 바꾼다.
 *   예: "ρ(T), y₆" → "\ensuremath{\rho}(T), y\ensuremath{_{6}}"
 */
const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa',
  λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', χ: 'chi',
  ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Υ: 'Upsilon',
  Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
}
const SUB = '₀₁₂₃₄₅₆₇₈₉'
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'

function escapeText(text: string): string {
  let out = ''
  for (const ch of text.replace(/[{}\\]/g, '')) {
    if (GREEK[ch]) out += `\\ensuremath{\\${GREEK[ch]}}`
    else if (SUB.includes(ch)) out += `\\ensuremath{_{${SUB.indexOf(ch)}}}`
    else if (SUP.includes(ch)) out += `\\ensuremath{^{${SUP.indexOf(ch)}}}`
    else if ('%#&_'.includes(ch)) out += `\\${ch}`
    else if (ch === '^') out += '\\^{}'
    else if (ch === '~') out += '\\textasciitilde{}'
    else out += ch
  }
  return out
}

export function titleToLatex(title: string): string {
  // 짝이 맞는 $…$만 수식으로 본다. 짝이 없는 $는 글자
  return title.split(/(\$[^$]+\$)/).map((part) => (/^\$[^$]+\$$/.test(part) ? part : escapeText(part).replace(/\$/g, '\\$'))).join('')
}
