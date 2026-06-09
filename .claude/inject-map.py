import re
START='<!-- ===== STATLY · Mapa klientů Litomyšl (slm) ===== -->'
END='<!-- ===== /STATLY · Mapa klientů Litomyšl ===== -->'
with open('.claude/litomysl-map.html','r',encoding='utf-8') as f:
    block=f.read().strip()

targets=[
    ('litomysl.html', '<!-- REFERENCE -->'),
    ('index.html', '<section class="sec-alt geo-section" id="kde-pusobime">'),
]
for fn, anchor in targets:
    with open(fn,'r',encoding='utf-8') as f:
        html=f.read()
    # remove existing block
    i=html.find(START); j=html.find(END)
    if i!=-1 and j!=-1:
        html=html[:i]+html[j+len(END):]
        html=re.sub(r'\n{3,}', '\n\n', html)
    idx=html.find(anchor)
    assert idx!=-1, f'anchor not found in {fn}'
    html=html[:idx]+block+'\n\n'+html[idx:]
    with open(fn,'w',encoding='utf-8') as f:
        f.write(html)
    print('injected into', fn)
