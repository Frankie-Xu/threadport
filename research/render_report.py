from pathlib import Path
import re,html
p=Path(__file__).parent
src=(p/'ThreadPort-战略与技术评估.md').read_text()
def inline(s):
 s=html.escape(s)
 tokens=[]
 def hold(t):
  tokens.append(t);return f'@@TOKEN{len(tokens)-1}@@'
 s=re.sub(r'`([^`]+)`',lambda m:hold('<code>'+m[1]+'</code>'),s)
 s=re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)',lambda m:hold('<a href="'+m[2]+'">'+m[1]+'</a>'),s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s)
 s=re.sub(r'\[(\d+)\]',lambda m:'<a class="ref" href="#ref-'+m[1]+'">['+m[1]+']</a>',s)
 for i,t in enumerate(tokens):s=s.replace(f'@@TOKEN{i}@@',t)
 return s
lines=src.splitlines();blocks=[];nav=[];i=0;sec=0
while i<len(lines):
 line=lines[i]
 if not line.strip():i+=1;continue
 if line.startswith('#'):
  m=re.match(r'(#+) (.*)',line);level=len(m[1]);title=m[2];ident=''
  if level==2:
   sec+=1;ident=f' id="section-{sec}"';nav.append(f'<a href="#section-{sec}">{html.escape(title)}</a>')
  blocks.append(f'<h{level}{ident}>{inline(title)}</h{level}>');i+=1
 elif line.startswith('|'):
  table=[]
  while i<len(lines) and lines[i].startswith('|'):table.append(lines[i]);i+=1
  rows=[]
  for j,row in enumerate(table):
   cells=[c.strip() for c in row.strip('|').split('|')]
   if all(re.fullmatch(r':?-+:?',c) for c in cells):continue
   tag='th' if j==0 else 'td';rows.append('<tr>'+''.join(f'<{tag}>'+inline(c)+f'</{tag}>' for c in cells)+'</tr>')
  blocks.append('<div class="table-wrap"><table>'+''.join(rows)+'</table></div>')
 elif re.match(r'\d+\. ',line):
  items=[]
  while i<len(lines) and re.match(r'\d+\. ',lines[i]):items.append('<li>'+inline(re.sub(r'^\d+\. ','',lines[i]))+'</li>');i+=1
  blocks.append('<ol>'+''.join(items)+'</ol>')
 else:
  para=[]
  while i<len(lines) and lines[i].strip():para.append(lines[i]);i+=1
  s=' '.join(para);m=re.match(r'^\[(\d+)\] ',s)
  ident=f' id="ref-{m[1]}" class="source"' if m else ''
  blocks.append('<p'+ident+'>'+inline(s)+'</p>')
css='''*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}body{margin:0;background:#fff;color:#242424;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC",sans-serif;line-height:1.85;font-size:16px}.layout{max-width:1320px;margin:auto;display:grid;grid-template-columns:240px minmax(0,900px);gap:52px;padding:48px 40px}nav{position:sticky;top:32px;align-self:start;font-size:13px;max-height:90vh;overflow:auto;border-right:1px solid #ddd;padding-right:20px}nav a{display:block;text-decoration:none;color:#555;padding:6px 0;line-height:1.5}nav a:hover{color:#000;text-decoration:underline}h1{font-size:34px;line-height:1.4;margin:0 0 28px;letter-spacing:-.6px}h2{font-size:24px;margin:54px 0 20px;line-height:1.5;border-top:1px solid #ddd;padding-top:28px}h3{font-size:19px;margin:30px 0 14px}p{margin:0 0 19px}a{color:#24547c;text-underline-offset:3px;overflow-wrap:anywhere}.ref{font-size:.8em;vertical-align:super;text-decoration:none;margin:0 2px}code{font-size:.87em;background:#f4f4f4;padding:2px 4px;overflow-wrap:anywhere}.table-wrap{overflow:auto;margin:20px 0 28px}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.65}th,td{padding:11px 12px;border:1px solid #ddd;text-align:left;vertical-align:top;min-width:115px}th{background:#f3f3f3;font-weight:600}tr:nth-child(odd) td{background:#fafafa}.source{font-size:13px;line-height:1.8;color:#555}li{padding-left:5px;margin-bottom:10px}::selection{background:#d9e5ef}@media(max-width:1000px){.layout{display:block;max-width:850px;padding:28px 22px}nav{position:static;max-height:none;border-right:0;border-bottom:1px solid #ddd;margin-bottom:35px;padding-bottom:20px;columns:2}h1{font-size:29px}}@media(max-width:500px){body{font-size:15px}nav{columns:1}h2{font-size:22px}th,td{min-width:125px}}@media print{nav{display:none}.layout{display:block;padding:0;max-width:none}body{font-size:10pt}h1{font-size:23pt}h2{font-size:16pt;break-after:avoid}h3{break-after:avoid}table{font-size:8pt}.table-wrap{overflow:visible}tr{break-inside:avoid}a{color:inherit;text-decoration:none}.source{font-size:8pt}}'''
out='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ThreadPort 战略与技术评估</title><style>'+css+'</style></head><body><div class="layout"><nav aria-label="报告目录">'+''.join(nav)+'</nav><main>'+''.join(blocks)+'</main></div></body></html>'
(p/'ThreadPort-战略与技术评估.html').write_text(out)
assert len(nav)==15
refs=set(re.findall(r'\[(\d+)\]',src));defs=set(re.findall(r'^\[(\d+)\]',src,re.M));assert refs==defs
assert out.count('<table>')==8,out.count('<table>')
print('HTML generated, 15 sections,',len(defs),'references; tables:',out.count('<table>'))
