#!/usr/bin/env python3
"""Cek kontras WCAG pasangan token Orvella di tema Terang dan Malam.
Pakai: python3 scripts/contrast.py   (tidak boleh ada FAIL)"""
import re, pathlib, sys

CSS = (pathlib.Path(__file__).resolve().parent.parent / 'mockups/css/tokens.css').read_text()

def block(src, start):
    i = src.index(start); j = src.index('{', i); depth = 0
    for k in range(j, len(src)):
        depth += src[k] == '{'; depth -= src[k] == '}'
        if depth == 0: return src[j + 1:k]

def tokens(text):
    return dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', text))

light = tokens(block(CSS, ':root {'))
dark = dict(light); dark.update(tokens(block(CSS, ':root[data-theme="dark"]')))

def resolve(t, v, depth=0):
    v = v.strip()
    m = re.fullmatch(r'var\((--[\w-]+)\)', v)
    return resolve(t, t[m.group(1)], depth + 1) if m and depth < 5 else v

def rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def lum(h):
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in rgb(h)]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)

PAIRS = [  # (teks, latar, minimum)
    ('--ink', '--bg', 4.5), ('--ink-2', '--bg', 4.5), ('--ink-3', '--bg', 4.5), ('--ink-3', '--surface', 4.5),
    ('--ink', '--surface', 4.5), ('--btn-ink', '--btn-bg', 4.5), ('#1E1C45', '--marigold', 4.5),
    ('--marigold-ink', '--marigold-soft', 4.5), ('--lilac-ink', '--lilac-soft', 4.5),
    ('--pahami-ink', '--pahami-soft', 4.5), ('--perkuat-ink', '--perkuat-soft', 4.5),
    ('--kuis-ink', '--kuis-soft', 4.5), ('--uji-ink', '--uji-soft', 4.5),
    ('--code-ink', '--code-bg', 4.5), ('--code-dim', '--code-bg', 4.5), ('--syn-com', '--code-bg', 4.5),
    ('--syn-kw', '--code-bg', 4.5), ('--syn-str', '--code-bg', 4.5), ('--syn-num', '--code-bg', 4.5), ('--syn-fn', '--code-bg', 4.5),
    ('--on-ink', '--ink', 4.5),
]
fails = 0
for name, t in (('Terang', light), ('Malam', dark)):
    print(f'\n== {name} ==')
    for f, b, need in PAIRS:
        fv = f if f.startswith('#') else resolve(t, t[f]); bv = resolve(t, t[b])
        r = ratio(fv, bv); ok = r >= need; fails += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {r:5.2f}  {f} di {b}")
sys.exit(1 if fails else 0)
