from pathlib import Path
import json,html
from PIL import Image,ImageChops,ImageOps
r=Path(__file__).resolve().parents[1];pub=r/'public/materials';(pub/'previews').mkdir(exist_ok=True)
presets=json.loads((pub/'presets.json').read_text('utf8'));items=presets['walls']+presets['floors']
for p in items:
    im=Image.open(pub/p['texture']/'color.jpg').convert('RGB')
    im=ImageChops.multiply(im,Image.new('RGB',im.size,p.get('tint','#ffffff')))
    im=ImageOps.fit(im,(260,144));im.save(pub/'previews'/f"{p['id']}.webp",quality=88)
rows=[]
for p in items:
    rows.append(f'<tr><td><img src="previews/{p["id"]}.webp" width="130"><br>{p["name"]}</td><td>{p["category"]} · 每片纹理覆盖 {p["meters"]} m<br>颜色、法线与粗糙度贴图；部分预设叠加配色。</td><td><a href="{('AUTHORED.html' if p['texture'] in ['clean_square_tiles','polished_marble'] else 'https://polyhaven.com/a/'+p['texture'])}">{p["texture"]}</a><br>{('原创项目材质' if p['texture'] in ['clean_square_tiles','polished_marble'] else 'CC0-1.0')}</td></tr>')
(pub/'ATTRIBUTION.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>墙地面纹理</title><style>body{max-width:1000px;margin:30px auto;padding:16px;font:16px/1.7 system-ui;color:#283441}td{padding:12px;border-bottom:1px solid #ddd}img{border-radius:6px}a{color:#1268bc}</style><h1>墙地面纹理</h1><p>12 种地板与 14 种墙面。缩略图从本地颜色贴图制作；实时效果还包含法线和粗糙度。除两类原创釉面砖与石纹外，纹理由 <a href="https://polyhaven.com/license">Poly Haven 以 CC0 发布</a>。这些是材质效果选项，未指代品牌商品；铺贴尺寸可作为视觉参考。</p><table>'+''.join(rows)+'</table></html>',encoding='utf8')
auth=json.loads((r/'catalog-source/authored-candidates.json').read_text('utf8'))
body=''.join(f'<tr><td>{i["name"]}<br>{i["size"]}</td><td>'+html.escape('；'.join(i['constructionDetails']))+'</td></tr>' for i in auth)
(r/'public/library/AUTHORED.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>日常家具 · 原创详细模型</title><style>body{font:16px/1.7 system-ui;max-width:1000px;margin:32px auto;padding:16px}td{padding:12px;border-bottom:1px solid #ddd}</style><h1>日常家具 · 原创详细模型</h1><p>23 款原创通用设计，以米为单位建模。尺寸为设计尺寸，可整体缩放；没有声称复刻某个品牌型号。模型包含实际结构、圆角、拼接和五金，所有部件作为一个家具操作。Blender 源文件保存在项目 catalog-source/authored 目录。纹理来自 Poly Haven：kitchen_wood、wood_table_001、denim_fabric、leather_white，均为 CC0。</p><p><a href="../materials/ATTRIBUTION.html">纹理来源</a> · <a href="ATTRIBUTION.html">完整家具库来源</a></p><table>'+body+'</table></html>',encoding='utf8')
print('Material previews:',len(items))
