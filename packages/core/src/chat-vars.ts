// 값을 알 수 없는 변수가 낱말 맨 앞에 올 때 (11/26 사용자 결정 "값을 알 수 없는 변수가 옵션 · 경로 자리에 올 때" 안 B).
// find . $x 의 x 가 -delete 면 지우고, git $x 가 push 면 올리고, sed $x 가 -i 면 파일을 고친다. 그 줄에 글자 그대로 적힌 값은 넣어서 보지만(variants),
// 다른 데서 온 값($(…) 의 출력 · read · 앞 명령이 남긴 것)은 알 수 없다. 옵션 하나로 지우기 · 쓰기 · 실행이 되는 프로그램에서만 한 번 묻는다

/** 옵션 하나로 하는 일이 바뀌는 프로그램 */
const VAR_PROGS = /^(find|fd|fdfind|git|sed)$/
/** 낱말 맨 앞의 변수: $x · ${x} · ${x:-…} · $1 · $@ ("$x" 의 따옴표는 낱말에서 이미 벗겨졌고, 작은따옴표 안의 $ 는 가려져 있다) */
const VAR_START = /^\$(?:\{([A-Za-z_]\w*|[0-9@*])|([A-Za-z_]\w*|[0-9@*]))/
/** 경로로 시작하는 환경 변수: 옵션이 되지 못한다 (폴더 밖인지는 경로 판정이 따로 본다) */
const PATH_VARS = /^(HOME|PWD|OLDPWD|TMPDIR)$/

/** 그 줄에 글자 그대로 적힌 값인가: 치환의 자리표(x=$(…) 는 SUBST 로 적힌다)나 다른 변수가 든 값은 알 수 없다 */
export const knownValue = (values: string[] | undefined): boolean => !!values && values.length > 0 && values.every((v) => !/SUBST|[$`]/.test(v))

/**
 * find 의 조건 가운데 값을 받는 것: 다음 낱말은 -로 시작해도 그 조건의 값이다 (find . -name "$pat" 의 $pat 은 옵션이 되지 못한다).
 * 차례로 읽어 값을 한 번씩만 뺀다: 앞 낱말만 보고 건너뛰면 find . -name -name $x 의 $x(조건 자리)를 놓친다
 */
const FIND_VALUE = /^-(i?name|i?path|i?regex|i?lname|i?wholename|newer\w*|type|xtype|maxdepth|mindepth|size|[amc]time|[amc]min|user|group|perm|samefile|inum|links|uid|gid|fstype|used|regextype)$/

/** 앞말을 뗀 낱말들(leading().rest)에서, 프로그램이 VAR_PROGS 이고 인자가 값을 모르는 변수로 시작하는가 */
export function unknownVarArg(rest: string[], prog: string, known: (name: string) => boolean): boolean {
  if (!VAR_PROGS.test(prog)) return false
  for (let i = 1; i < rest.length; i++) {
    if (prog === 'find' && FIND_VALUE.test(rest[i]!)) { i++; continue }
    const m = VAR_START.exec(rest[i]!)
    const name = m?.[1] ?? m?.[2]
    if (name && !PATH_VARS.test(name) && !known(name)) return true
  }
  return false
}

/**
 * for 이름 in 낱말…: 도는 낱말이 모두 옵션이 될 수 없는 글자(글자 · 숫자 · _ · . · /)로 시작하면 그 변수는 옵션이 되지 못한다 (for f in src/*.ts).
 * * 로 시작하는 무늬(*.md)는 -로 시작하는 파일 이름에도 맞으므로 넣지 않는다. 변수 · 치환이 든 낱말도 아니다
 */
export function noteLoopVars(all: string[], safe: Set<string>): void {
  const w = /^(do|then|else|\{)$/.test(all[0] ?? '') ? all.slice(1) : all
  if (w[0] !== 'for' || !/^[A-Za-z_]\w*$/.test(w[1] ?? '') || w[2] !== 'in') return
  if (w.length > 3 && w.slice(3).every((x) => /^[A-Za-z0-9_./]/.test(x) && !/[$`]|SUBST/.test(x))) safe.add(w[1]!)
  else safe.delete(w[1]!)
}
