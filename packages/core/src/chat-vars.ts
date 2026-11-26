// 값을 알 수 없는 변수가 낱말 맨 앞에 올 때 (11/26 사용자 결정 "값을 알 수 없는 변수가 옵션 · 경로 자리에 올 때" 안 B).
// find . $x 의 x 가 -delete 면 지우고, git $x 가 push 면 올리고, sed $x 가 -i 면 파일을 고친다. 그 줄에 글자 그대로 적힌 값은 넣어서 보지만(variants),
// 다른 데서 온 값($(…) 의 출력 · read · 앞 명령이 남긴 것)은 알 수 없다. 옵션 하나로 지우기 · 쓰기 · 실행이 되는 프로그램에서만 한 번 묻는다

/** 옵션 하나로 하는 일이 바뀌는 프로그램 */
const VAR_PROGS = /^(g?find|fd|fdfind|git|g?sed)$/
/**
 * 낱말 맨 앞의 펼침 ("$x" 의 따옴표는 낱말에서 이미 벗겨졌고, 작은따옴표 안의 $ 는 가려져 있다):
 * ${이름} · ${이름:-기본값} 류(1 · 2번 묶음) | ${이름 뒤에 다른 것: 값을 바꿔 쓴다 ${x#a} · ${x:1} · ${x/a/b}}(1번만) | ${ 뒤가 이름이 아닌 것 ${!y} · ${=x} · ${(z)x} | $이름(3번)
 */
const VAR_START = /^\$(?:\{([A-Za-z_]\w*|[0-9@*])(\}|:?[-+=?])?|\{|([A-Za-z_]\w*|[0-9@*]))/
/** 경로로 시작하는 환경 변수: 옵션이 되지 못한다 (폴더 밖인지는 경로 판정이 따로 본다) */
const PATH_VARS = /^(HOME|PWD|OLDPWD|TMPDIR)$/

/** 그 줄에 글자 그대로 적힌 값인가: 치환의 자리표(x=$(…) 는 SUBST 로 적힌다)나 다른 변수가 든 값은 알 수 없다 */
export const knownValue = (values: string[] | undefined): boolean => !!values && values.length > 0 && values.every((v) => !/SUBST|[$`]/.test(v))

/**
 * find 의 조건 가운데 값을 받는 것: 다음 낱말은 -로 시작해도 그 조건의 값이다 (find . -name "$pat" 의 $pat 은 옵션이 되지 못한다).
 * 차례로 읽어 값을 한 번씩만 뺀다: 앞 낱말만 보고 건너뛰면 find . -name -name $x 의 $x(조건 자리)를 놓친다.
 * 표에 없는 조건을 만나면(값을 받는지 모른다: -fprintf 파일 꼴 · 새 조건) 그 뒤로는 값 자리를 믿지 않는다 (find . ! -xattrname -name $x, 11/26 검토)
 */
const FIND_VALUE = /^-(i?name|i?path|i?regex|i?lname|i?wholename|[acm]?newer\w*|Bnewer|type|xtype|maxdepth|mindepth|size|[acmB]time|[acmB]min|user|group|perm|samefile|inum|links|uid|gid|fstype|used|regextype|xattrname|flags|printf|fprint|fprint0|fls)$/
const FIND_PLAIN = /^(-(print|print0|ls|delete|prune|empty|follow|mount|xdev|nouser|nogroup|true|false|a|o|and|or|not|daystart|quit|[HLPEXdsx]+)|[!(),])$/

/** 앞말을 뗀 낱말들(leading().rest)에서, 프로그램이 VAR_PROGS 이고 인자가 값을 모르는 변수(나 치환)로 시작하는가 */
export function unknownVarArg(rest: string[], prog: string, known: (name: string) => boolean): boolean {
  if (!VAR_PROGS.test(prog)) return false
  const find = /find$/.test(prog)
  const memo = new Map<string, boolean>()
  const knows = (n: string) => { let k = memo.get(n); if (k === undefined) { k = known(n); memo.set(n, k) } return k }
  let strict = false
  for (let i = 1; i < rest.length; i++) {
    const w = rest[i]!
    // git … -- <경로>: -- 뒤는 옵션이 되지 못한다
    if (prog === 'git' && w === '--') return false
    if (find && !strict && w.startsWith('-')) {
      if (FIND_VALUE.test(w)) { i++; continue }
      if (!FIND_PLAIN.test(w)) strict = true
    }
    // 치환의 출력($( … ) 은 SUBST 로 적힌다)과 중괄호 안의 펼침({,}$x)도 무엇이 될지 모른다.
    // git 은 치환을 값으로 받는 흔한 꼴이 많아 뺀다 (git commit -m "$(cat <<EOF …)" · git log $(git merge-base a b)..HEAD)
    if ((prog !== 'git' && /^SUBST/.test(w)) || (w.startsWith('{') && /\$|SUBST/.test(w))) return true
    const m = VAR_START.exec(w)
    if (!m) continue
    const name = m[2] !== undefined ? m[1] : m[3]
    if (name === undefined || (!PATH_VARS.test(name) && !knows(name))) return true
  }
  return false
}

/** 값을 다른 데서 받게 하는 명령: 이름이 적힌 변수는 그 뒤로 값을 모른다 (x=a; read x; find . $x) */
const TAKES = /^(read|export|typeset|declare|local|readonly|printf|mapfile|readarray|getopts|unset|integer|float)$/

/**
 * 한 번의 읽기에서 변수를 따라간다: 옵션이 될 수 없는 반복 변수, 값을 다른 데서 받은 변수, 그리고 값을 모르는 변수가 인자 맨 앞에 온 적이 있는지(hit).
 * 값이 그 줄에 적힌 변수는 부르는 쪽의 표(noteVars · noteGroupVars)가 안다: valuesOf 로 받는다
 */
export class VarWatch {
  hit = false
  private readonly loop = new Set<string>()
  private readonly taken = new Set<string>()
  /** all = 조각의 낱말, cmds = 앞말을 뗀 명령들(조각 전체와 묶음으로 나눈 것), unmask = 가린 글자 되돌리기 */
  see(all: string[], cmds: string[][], unmask: (w: string) => string, valuesOf: (name: string) => string[] | undefined): void {
    const known = (n: string) => !this.taken.has(n) && (this.loop.has(n) || knownValue(valuesOf(n)))
    for (const rest of cmds) if (rest.length && unknownVarArg(rest, unmask(rest[0]!).split('/').pop()!, known)) this.hit = true
    const w = /^(do|then|else|elif|if|while|until|\{|!)$/.test(all[0] ?? '') ? all.slice(1) : all
    // for 이름 in 낱말…: 도는 낱말이 모두 옵션이 될 수 없는 글자(글자 · 숫자 · _ · . · /)로 시작하거나 수의 범위({1..5})면 그 변수는 옵션이 되지 못한다
    // (for f in src/*.ts). * 로 시작하는 무늬(*.md)는 -로 시작하는 파일 이름에도 맞으므로 넣지 않는다. 변수 · 치환이 든 낱말도 아니다
    if (w[0] === 'for' && /^[A-Za-z_]\w*$/.test(w[1] ?? '') && w[2] === 'in') {
      this.taken.delete(w[1]!)
      if (w.length > 3 && w.slice(3).every((x) => (/^[A-Za-z0-9_./]/.test(x) || /^\{\d+\.\.\d+(\.\.\d+)?\}$/.test(x)) && !/[$`]|SUBST/.test(x))) this.loop.add(w[1]!)
      else this.loop.delete(w[1]!)
      return
    }
    // 값을 새로 넣으면 반복 변수 · 받은 변수가 아니다 (글자 그대로인 값인지는 부르는 쪽의 표가 안다)
    if (w.length && w.every((x) => /^[A-Za-z_]\w*=/.test(x))) { for (const x of w) { const n = x.slice(0, x.indexOf('=')); this.loop.delete(n); this.taken.delete(n) } return }
    if (TAKES.test(unmask(w[0] ?? ''))) for (const x of w.slice(1)) { const m = /^([A-Za-z_]\w*)(=|$)/.exec(x); if (m) { this.taken.add(m[1]!); this.loop.delete(m[1]!) } }
  }
}
