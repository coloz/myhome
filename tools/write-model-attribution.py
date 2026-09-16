from pathlib import Path
import json,html
root=Path(__file__).resolve().parents[1];p=root/'public/library/ATTRIBUTION.html';text=p.read_text('utf8')
mark='<h2>Kator Legaz 与 Blend Swap 实体模型</h2>'
if mark in text:text=text[:text.index(mark)]
rows=json.loads((root/'catalog-source/open-models-conversion.json').read_text('utf8'))
section=mark+'''<p>新增模型来自 <a href="https://www.sweethome3d.com/free-3d-models/">Sweet Home 3D 官方免费模型目录</a>。Kator Legaz 模型作者为 Andrew Kator 与 Jennifer Legaz，使用 <a href="https://creativecommons.org/licenses/by/3.0/us/">CC BY 3.0 US</a>；Blend Swap 模型按条目采用 <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a> 或 <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>。原包由 Emmanuel Puybaret 整理并转换。</p><p>本程序通过 Blender 进行 OBJ/MTL → GLB 转换，清除不参与面的孤立点，按原模型库标称尺寸统一米制与落地原点，限制贴图边长并调整粗糙度。保留模型外形、纹理及整件结构；这些开放模型不表示宜家或任何电器品牌官方模型。作者的原始许可说明见下表。</p>'''
for name in ['KatorLegaz','BlendSwap-CC-0','BlendSwap-CC-BY']:
    section+=f'<p><a href="https://sourceforge.net/projects/sweethome3d/files/SweetHome3D-models/3DModels-1.9.3/3DModels-{name}-1.9.3.zip/download">{name} 原始模型包</a> · <a href="{name}-LICENSE.txt">原包许可</a></p>'
section+='<table><tr><th>模型</th><th>作者</th><th>许可</th></tr>'
for r in rows:
    url=html.escape(r['source']);title=html.escape(r['name']);rid=html.escape(r['id']);author=html.escape(r['creator']);license=html.escape(r['license']);notice=html.escape(r['licenseFile'].removeprefix('library/'))
    section+=f'<tr><td><a href="{url}">{title}</a><br><small>{rid}</small></td><td>{author}</td><td><a href="{notice}">{license}</a></td></tr>'
section+='</table>'
text=text.replace('只有放入房间的实体模型才会下载','只有主动预览或放入房间的实体模型才会下载')
p.write_text(text+section,encoding='utf8')
