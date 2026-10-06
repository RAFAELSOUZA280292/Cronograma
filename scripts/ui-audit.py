#!/usr/bin/env python3
"""Auditoria de UI (Onda 2, §81): conta o que o plano de usabilidade quer ver em zero.
Uso: python3 scripts/ui-audit.py [-v]
  1. window.confirm/alert/prompt (e confirm()/alert()/prompt() soltos)  -> deve ser 0
  2. <button> sem nome acessível (só ícone, sem aria-label/title)        -> deve ser 0
  3. <button disabled> sem title explicando o motivo                     -> deve ser 0
Heurística (regex), não parser: falsos positivos possíveis; o `-v` lista cada ocorrência.
"""
import re, glob, sys
verbose = '-v' in sys.argv
native = []
nolabel = []
disabled_nr = []
for f in sorted(glob.glob('src/**/*.js*', recursive=True)):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'window\.(confirm|alert|prompt)\(|(?<![.\w])(confirm|alert|prompt)\(', s):
        line = s[:m.start()].count('\n') + 1
        ctx = s[max(0, s.rfind('\n', 0, m.start())):s.find('\n', m.start())]
        if re.search(r'function\s+(confirm|alert|prompt)\b|async function (confirm)\b', ctx):
            continue
        native.append((f, line))
    if not f.endswith('.jsx'):
        continue
    i = 0
    while True:
        m = re.search(r'<button\b', s[i:])
        if not m:
            break
        a = i + m.start(); j = a + 7; depth = 0
        while j < len(s):
            c = s[j]
            if c == '{': depth += 1
            elif c == '}': depth -= 1
            elif c == '>' and depth == 0: break
            j += 1
        tag = s[a:j + 1]
        k = s.find('</button>', j)
        body = s[j + 1:k] if k > 0 else ''
        line = s[:a].count('\n') + 1
        txt = re.sub(r'\{[^{}]*\}', '', re.sub(r'<[^>]+>', '', body)).strip()
        # Texto literal, ou uma expressão {…} que não renderiza JSX (variável/condicional de texto) conta como rótulo.
        exprs = re.findall(r'\{([^{}]*)\}', re.sub(r'<[A-Za-z][^<>]*?/>|</?[A-Za-z][^<>{}]*>', '', body))
        textful = bool(re.search(r'[A-Za-zÀ-ú]{2,}', txt)) or any('<' not in e and '/>' not in e and e.strip() and not e.strip().startswith('...') for e in exprs)
        if not textful and 'aria-label' not in tag and 'title=' not in tag and '{...' not in tag:
            nolabel.append((f, line))
        if re.search(r'\bdisabled\b', tag) and 'title=' not in tag and '{...' not in tag:
            disabled_nr.append((f, line))
        i = j
print(f'confirm/alert/prompt nativos : {len(native)}')
print(f'botões sem nome acessível    : {len(nolabel)}')
print(f'disabled sem motivo (title)  : {len(disabled_nr)}')
if verbose:
    for name, rows in (('NATIVOS', native), ('SEM NOME', nolabel), ('DISABLED SEM MOTIVO', disabled_nr)):
        print(f'\n-- {name}')
        for f, l in rows: print(f'{f}:{l}')
sys.exit(0 if not (native or nolabel or disabled_nr) else 1)
