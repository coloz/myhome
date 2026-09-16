"""Publish only approved assets and thumbnails rendered from those exact GLBs."""
from pathlib import Path
import json, html, shutil
from PIL import Image
root=Path(__file__).resolve().parents[1];pub=root/'public/library'
data=json.loads((pub/'catalog.v1.json').read_text('utf8'));items=data['items']
(pub/'previews').mkdir(exist_ok=True)
for i in items:
    source=root/'test-results/model-audit'/f"{i['id']}.png"
    assert source.exists(),i['id']
    Image.open(source).convert('RGB').save(root/'public'/i['image'],quality=88,method=6)
# Archive rejected files under the project's source evidence folder. The public
# deployment contains no inactive model geometry or misleading product photos.
archive=root/'catalog-source/retired-assets';archive.mkdir(exist_ok=True)
models=(pub/'models').resolve();assert models.is_relative_to(root.resolve())
allowed={Path(i['model']).name for i in items}
for p in models.glob('*.glb'):
    if p.name not in allowed:
        assert p.resolve().parent==models
        dest=archive/p.name
        if not dest.exists():shutil.copy2(p,dest)
        p.unlink()
thumbs=(pub/'thumbs').resolve()
if thumbs.exists():
    assert thumbs.is_relative_to(root.resolve())
    dest=root/'catalog-source/retired-thumbnails'
    shutil.copytree(thumbs,dest,dirs_exist_ok=True);shutil.rmtree(thumbs)
audit=json.loads((pub/'catalog-audit.json').read_text('utf8'))
rows=[]
for i in items:
    e=lambda s:html.escape(str(s),quote=True)
    rows.append('<tr><td><img width="120" loading="lazy" src="'+e(i['image'].removeprefix('library/'))+'"><br>'+e(i['name'])+'</td><td>'+e(i['quality'])+'<br>'+e(i['size'])+'<br>'+e(i['precision'])+'</td><td><a href="'+e(i['source'].removeprefix('library/'))+'">'+e(i['creator'])+'</a><br>'+e(i['license'])+(('<br><a href="'+e(i['licenseFile'].removeprefix('library/'))+'">原始许可</a>') if i.get('licenseFile') else '')+'</td></tr>')
(pub/'ATTRIBUTION.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>家具库 · 模型与来源</title><style>body{font:16px/1.65 system-ui;margin:30px auto;max-width:1000px;padding:0 16px;color:#26313d}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}table{width:100%}a{color:#0067c5}img{border-radius:8px}</style><h1>家具库 · 外观质量审核</h1><p>当前 '+str(len(items))+' 款：46 款 Poly Haven 原始 PBR 模型，25 款现成模型完成材质修正，23 款原创建模的日常家具。已移除尺寸示意、通用几何拼装和未通过外观检查的模型。截图直接来自对应 GLB。</p><p>保留原网格和 UV，不进行减面。Poly Haven 模型含原始 2K 材质贴图；其他模型保留原始贴图，并修正金属、玻璃、涂层与陶瓷反射。尺寸采用原模型的比例或标称值，不等于品牌实测。</p><p><a href="https://polyhaven.com/license">Poly Haven CC0 许可</a> · <a href="quality-review.json">逐项审核记录</a> · <a href="catalog-audit.json">统计</a> · <a href="../index.html">返回模拟器</a></p><table><thead><tr><th>模型实景</th><th>模型 / 尺寸</th><th>来源 / 许可</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></html>',encoding='utf8')
text=f'''# 家具与电器库

2026-09-16 外观质量修订：保留 **{len(items)} 款**，46 款完整 PBR 模型，25 款现成模型完成材质修正，23 款原创详细家具。下架 {audit['removedStyles']} 个旧 ID（含原始20个定制示意条目）。同款颜色不拆分计数。数量不再作为模型入库依据。

## 处理结果

| 类别 | 决定 | 依据 |
|---|---|---|
| 1473 个宜家尺寸示意条目 | 全部移除 | 尺寸不能推导真实造型，没有使用通用几何代替商品 |
| 20 个旧定制示意条目 | 全部移除 | 方块 / 球体等拼装不满足外观要求 |
| 原317个公开模型 | 25个优化保留，292个移除 | 逐件渲染检查，不能仅因文件为GLB就判断质量合格 |
| 46个Poly Haven模型 | 新增 | 原始网格、UV、2K颜色/法线/粗糙度等贴图完整保留 |

优化保留的电器有冰箱、洗衣机、厨师机、电饭煲、电磁灶、烤箱、洗碗机、抽油烟机、风扇、音响、投影仪等；保留的卫浴具有实际盆腔、配件等结构；藤编和布艺家具保留原UV纹理。材质修复不修改几何，不把平整的金属或釉面当成木纹或织物。

46款现成资源包括中古休闲椅、木柜、软包沙发、茶几、餐椅、木餐桌、中式木家具与复古电器。材质完整不等于实拍照片；玻璃、纹理和反射随室内光照而变。尺寸采用模型自身米制比例或来源标称尺寸，均未标记为品牌实测。

## 日常家具和墙地面

新增 23 款日常家具：衣柜、书柜、抽屉柜、鞋柜、床头柜、床、沙发、餐椅、餐桌、升降桌、推车、洞洞板和不锈钢台面橱柜等。模型具有实际倒角、门缝、铰链、拉手、连接梁、脚垫、织物滚边和开孔。原始 Blender 文件在 `catalog-source/authored/`；通用原创设计不冒充品牌型号，尺寸为设计尺寸。

右侧“墙体 / 装修”有 12 种地板和 14 种墙面预设：木地板、拼花、陶砖、水磨石、大理石、墙漆、泥灰涂料、方砖及木饰面。按房间或全屋应用，纹理按米制 UV 铺贴，只有使用时才加载颜色、法线、粗糙度贴图，配色共享图像缓存。保留撤销/重做、JSON和云端保存。GLB 导出等待当前材质加载；失败可重试。浅色釉面方砖和抛光石纹为本项目原创 PBR 材质，其他纹理来源见 `public/materials/ATTRIBUTION.html`。

## 使用

- 按类型、风格、来源、最大宽度及关键字筛选；24张卡片一页。卡片是实际模型截图。
- 查看详情后可旋转三维预览；点击添加或拖放进房间，整体移动、Tab旋转、复制和删除。
- 使用原模型分部件材质，取消对库内完整模型的全物件纯色覆盖，避免抹掉贴图。
- 已保存方案中的下架家具不再渲染，也没有替代方块；家具清单保留“待替换”记录。选择后点击“从家具库替换”，保持位置、朝向、比例，可撤销/重做。也可删除记录。
- 旧方案的墙体、装修和房间记录保留。户型模板中的原有定制家具不属于本轮家具库清理范围。
- 修改仍在停止操作5秒后自动保存云端。GLB导出前需替换或删除下架记录；JSON导出保留这些记录。

## 性能与审核

浏览目录只加载索引和WebP截图。点击预览或添加后才取GLB；最多3个并发，25秒超时，单文件20MB上限。二进制文件缓存48MB / 24条，预览与放置复用下载，场景实例分别拥有几何与材质，释放时不影响其他家具。加载失败显示重试，不显示简化替身。

`public/library/quality-review.json` 记录每个旧条目的处置；`catalog-source/quality-material-changes.json` 记录材质修改；`test-results/model-audit/` 是完整审核截图。被移除文件在工作目录的 `catalog-source/retired-assets/` 保留归档，不随网站发布。

## 可复现流程

```powershell
python tools/download-pbr-models.py
node tools/pack-pbr-models.cjs
python tools/expand-assets.py
blender --background --python tools/build-everyday.py
node tools/pack-pbr-models.cjs everyday-online-selected.json everyday-online-candidates.json
node tools/finish-previews.cjs
python tools/build-clean-finishes.py
python tools/finish-previews.py
node tools/curate-models.cjs
node tools/model-visual-audit.cjs public/library/catalog.v1.json --force
python tools/finalize-quality-library.py
npm run build
node tests/catalog-data.cjs
node tests/furniture-library.cjs
node tests/catalog-preview.cjs
```

不再运行旧的尺寸示意目录生成脚本。每款模型的作者、来源、许可在 `public/library/ATTRIBUTION.html` 可查看。[Poly Haven 资源许可](https://polyhaven.com/license)为CC0；其他保留模型沿用原文件署名与许可。没有把第三方普通模型称为宜家官方3D模型。
'''
(root/'CATALOG.md').write_text(text,encoding='utf8')
raw=root/'RAW-SHELL.md';lines=raw.read_text('utf8').splitlines()
for n,line in enumerate(lines):
    if line.startswith('8. 家具库'):lines[n]='8. 家具库仅保留通过外观审核的94款完整模型，可按类型、风格筛选。点击添加或拖入空间，整体移动、旋转、缩放、复制与删除；Tab旋转90°。下架的简化模型只保留位置记录，可从家具清单选择替换。具体资源与尺寸说明见 CATALOG.md。'
raw.write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps(audit,ensure_ascii=False))
