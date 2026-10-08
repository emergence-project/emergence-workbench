"""LaTeX body-only research note -> Markdown + KaTeX (research-workspace 10/4 format).
Keeps math, labels and refs verbatim; comments become <!-- -->; nothing is dropped silently.
Prints a report of every non-syntactic change to stderr."""
import re, sys

MATH_ENVS = ('equation', 'equation*', 'align', 'align*', 'eqnarray', 'eqnarray*', 'subequations', 'gather', 'gather*', 'multline', 'multline*')
report = []

def balanced(s, i):
    """s[i] == '{' -> index after the matching '}'"""
    depth = 0
    for j in range(i, len(s)):
        c = s[j]
        if c == '\\': continue
        if c == '{' and (j == 0 or s[j-1] != '\\'): depth += 1
        elif c == '}' and (j == 0 or s[j-1] != '\\'):
            depth -= 1
            if depth == 0: return j + 1
    raise ValueError('unbalanced: ' + s[i:i+60])

def repl_cmd(s, name, fn):
    out, i = [], 0
    pat = re.compile(r'\\' + name + r'\s*\{')
    while True:
        m = pat.search(s, i)
        if not m: out.append(s[i:]); break
        b = m.end() - 1
        e = balanced(s, b)
        out.append(s[i:m.start()]); out.append(fn(s[b+1:e-1])); i = e
    return ''.join(out)

def split_comment(line):
    """(code, comment) on an unescaped %"""
    m = re.search(r'(?<!\\)%', line)
    return (line, None) if not m else (line[:m.start()], line[m.start()+1:])

def prose(t):
    """inline LaTeX prose -> Markdown; math $..$ kept verbatim"""
    t = re.sub(r'\\texorpdfstring\{([^{}]*)\}\{[^{}]*\}', r'\1', t)
    parts = re.split(r'((?<!\\)\$[^$]+(?<!\\)\$)', t)
    res = []
    for k, p in enumerate(parts):
        if k % 2: res.append(p); continue
        p = re.sub(r'\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}', r'![](\1)', p)
        p = repl_cmd(p, 'cite', lambda x: '[' + '; '.join('@' + c.strip() for c in x.split(',')) + ']')
        p = repl_cmd(p, 'footnote', lambda x: '^[' + prose(x).strip() + ']')
        for c in ('emph', 'textit'): p = repl_cmd(p, c, lambda x: '*' + prose(x).strip() + '*')
        p = repl_cmd(p, 'textbf', lambda x: '**' + prose(x).strip() + '**')
        p = re.sub(r"`([^`']*)'", r'‘\1’', p.replace('``', '“'))
        p = p.replace('``', '“').replace("''", '”').replace('~', ' ')
        p = re.sub(r'\\([&%#])', r'\1', p)
        res.append(p)
    return ''.join(res)

def figure(body):
    g = re.search(r'\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}', body)
    cap = ''
    m = re.search(r'\\caption\s*\{', body)
    if m:
        e = balanced(body, m.end() - 1); cap = body[m.end():e-1]
    lab = re.search(r'\\label\{([^}]*)\}', body)
    capl, coms = [], []
    for l in cap.splitlines():
        code, com = split_comment(l)
        if code.strip(): capl.append(code.strip())
        if com is not None and com.strip(): coms.append(com.strip())
    cap = ' '.join(capl)
    alt = prose(cap) + (f' \\label{{{lab.group(1)}}}' if lab else '')
    if '[' in alt or ']' in alt: report.append(f'figure caption has [ ] (check): {g.group(1) if g else "?"}')
    return f'![{alt}]({g.group(1) if g else "?"})' + ''.join(f'\n<!--{c} -->' for c in coms)

def tabular(body):
    rows = re.search(r'\\begin\{tabular\}\{[^}]*\}(.*?)\\end\{tabular\}', body, re.S).group(1)
    cap = ''
    m = re.search(r'\\caption\s*\{', body)
    if m: e = balanced(body, m.end()-1); cap = body[m.end():e-1].strip()
    lines, comments = [], []
    for r in rows.split('\\\\'):
        r2 = []
        for l in r.splitlines():
            code, com = split_comment(l)
            if com is not None and com.strip(): comments.append(com.strip())
            r2.append(code)
        r = ' '.join(r2).replace('\\hline', '').strip()
        if not r: continue
        lines.append('| ' + ' | '.join(prose(c.strip()) for c in r.split('&')) + ' |')
    if len(lines) >= 1: lines.insert(1, '|' + '---|' * lines[0].count(' | ') + '---|')
    lab = re.search(r'\\label\{([^}]*)\}', body)
    out = ([f'**표.** {prose(cap)}' + (f' \\label{{{lab.group(1)}}}' if lab else ''), ''] if cap else []) + lines
    out += [f'<!-- {c} -->' for c in comments]
    report.append('table -> Markdown table (rules \\hline dropped)')
    return '\n'.join(out)

def convert(src):
    body = src
    m = re.search(r'\\begin\{document\}', body)
    if m: body = body[m.end():]
    m = re.search(r'\\end\{document\}', body)
    if m: body = body[:m.start()]
    # comments are kept verbatim: mask them before touching footnotes
    coms = []
    def mask(l):
        code, com = split_comment(l)
        if com is None: return l
        coms.append(com); return code + f'%\x03{len(coms)-1}\x03'
    body = '\n'.join(mask(l) for l in body.split('\n'))
    unmask = lambda t: re.sub(r'\x03(\d+)\x03', lambda m: coms[int(m.group(1))], t)
    # footnotes may span lines and blank lines: convert them first into one-line placeholders
    notes = []
    def fn(x):
        kept = []
        for l in x.split('\n'):
            code, com = split_comment(l)
            kept.append(prose(code.strip()) + (f' <!--{unmask(com).rstrip()} -->' if com is not None and unmask(com).strip() else ''))
        notes.append('^[' + ' '.join(k for k in kept if k).strip() + ']')
        return f'\x02{len(notes)-1}\x02'
    def fn_outside_comments(t):
        res = []
        for l in t.split('\n'):
            res.append(l)
        return '\n'.join(res)
    # only lines whose code part holds \footnote: comments are masked, so repl_cmd never sees comment text
    body = repl_cmd(body, 'footnote', fn)
    body = unmask(body)
    if notes: report.append(f'{len(notes)} footnote(s) -> ^[...] inline notes')
    lines = body.split('\n')
    out, i = [], 0
    para = []
    def flush():
        if para:
            out.append(prose(' '.join(p for p in para if p))); para.clear()
    while i < len(lines):
        line = lines[i]; s = line.strip()
        env = re.match(r'\\begin\{([a-zA-Z*]+)\}', s)
        if s.startswith('%'):
            flush()
            # comment block: gather consecutive comment lines
            block = []
            while i < len(lines) and lines[i].strip().startswith('%'):
                block.append(lines[i].strip()[1:].rstrip()); i += 1
            txt = '\n'.join(block).replace('--', '‐‐')
            out.append(f'<!--{txt if len(block) > 1 else txt} -->' if len(block) == 1 else '<!--\n' + txt + '\n-->')
            continue
        if not s:
            flush(); out.append(''); i += 1; continue
        if re.match(r'\\bibliography\{', s) or re.match(r'\\bibliographystyle\{', s) or s == '\\input{setting}':
            flush(); report.append(f'dropped (app adds at compile): {s}'); i += 1; continue
        if s == '\\appendix':
            flush(); out.append('\\appendix'); i += 1; continue
        sec = re.match(r'\\(sub)*section\*?\s*\{', s)
        if sec:
            flush()
            level = 2 + s[:sec.end()].count('sub')
            e = balanced(s, sec.end() - 1)
            title = s[sec.end():e-1]; rest = s[e:].strip()
            lab = re.match(r'\\label\{([^}]*)\}', rest)
            if lab: rest = rest[lab.end():].strip()
            out.append('#' * level + ' ' + prose(title) + (f' \\label{{{lab.group(1)}}}' if lab else ''))
            if rest: para.append(rest)
            i += 1; continue
        if env:
            name = env.group(1)
            # collect until matching end (nesting-aware for same name)
            depth, j, chunk = 0, i, []
            while j < len(lines):
                l = lines[j]; chunk.append(l)
                depth += len(re.findall(r'\\begin\{' + re.escape(name) + r'\}', l)) - len(re.findall(r'\\end\{' + re.escape(name) + r'\}', l))
                j += 1
                if depth <= 0: break
            text = '\n'.join(chunk)
            if name in MATH_ENVS:
                flush()
                # strip common indent, keep content verbatim
                out.append('$$\n' + '\n'.join(l.rstrip() for l in chunk).strip() + '\n$$')
                i = j; continue
            if name == 'figure':
                flush(); out.append(figure(text)); i = j; continue
            if name == 'table':
                flush(); out.append(tabular(text)); i = j; continue
            if name in ('itemize', 'enumerate'):
                flush()
                items = re.split(r'\\item\s*', re.sub(r'\\(begin|end)\{(itemize|enumerate)\}', '', text))
                mark = '-' if name == 'itemize' else '1.'
                for it in items:
                    it = ' '.join(x.strip() for x in it.strip().splitlines() if x.strip())
                    if it: out.append(f'{mark} {prose(it)}')
                i = j; continue
            if name == 'center':
                flush()
                inner = re.sub(r'\\(begin|end)\{center\}', '', text)
                report.append('center environment unwrapped (contents kept): ' + ' '.join(inner.split())[:70])
                lines[i:j] = inner.split('\n'); continue
            flush(); report.append(f'UNHANDLED env {name} kept as text'); para.extend(chunk); i = j; continue
        code, com = split_comment(line)
        if com is not None and code.strip():
            para.append(code.rstrip()); para.append(f'<!--{com.rstrip()} -->')
        elif com is not None:
            para.append(f'<!--{com.rstrip()} -->')
        else:
            para.append(line.strip())
        i += 1
    flush()
    md = '\n'.join(out)
    md = re.sub(r'\x02(\d+)\x02', lambda m: notes[int(m.group(1))], md)
    md = re.sub(r'\n{3,}', '\n\n', md).strip() + '\n'
    return md

if __name__ == '__main__':
    src = open(sys.argv[1], encoding='utf8').read()
    md = convert(src)
    open(sys.argv[2], 'w', encoding='utf8').write(md)
    for r in report: print('  -', r, file=sys.stderr)
