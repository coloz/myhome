# 家具素材源资料

本目录用于素材采集、模型转换、原创建模和质量审核。网页运行及普通 `npm run build` 使用的是 `public/library/` 和 `public/materials/`，不会打包本目录。

本目录仍包含有用源文件，不能整体删除：

| 内容 | 用途 |
| --- | --- |
| `authored/*.blend` | 23 款原创家具的 Blender 源文件；质量测试也会检查这些文件 |
| `open-obj/`、`scopia-obj/` | 已解压的第三方模型、纹理，供重新转换使用 |
| `polyhaven/`、`polyhaven-*.json` | Poly Haven 模型、贴图、来源和下载缓存，供素材重新打包使用 |
| `*-candidates.json`、`*-selected.json`、转换记录 | 当前家具库的选型、生成输入和来源记录 |
| `catalog-before-quality.json`、`quality-material-changes.json` | 质量修订前的目录和材质调整记录 |
| `retired-assets/` | 原模型归档，其中 25 个原模型仍用于材质修订和几何一致性测试 |
| `retired-thumbnails/` | 下架模型的历史缩略图归档 |

2026-09-16 已将以下 2266 个文件（约 137 MiB）移入系统回收站，可在回收站恢复；清空回收站后才会释放磁盘空间：

- `Scopia.zip`、`KatorLegaz.zip`、`BlendSwap-CC-0.zip`、`BlendSwap-CC-BY.zip`：已解压并生成发布用 GLB；源文件与 `public/library/` 中的许可仍保留。需要原压缩包时运行 `python tools/download-open-models.py`。
- `measurements/`、`search-*.json`、`articles.json`、`candidates.json`、`excluded-dimensions.json`：旧宜家尺寸示意目录的采集数据，当前家具库已不使用。例如 `measurements/20610806.json` 仅记录商品链接及宽、深、高，不是三维模型。
- 转换日志、`finish-presets.cjs`、`legacy-metadata.cjs`：运行记录和可由相应工具重新生成的临时模块。

旧宜家采集和尺寸示意脚本不属于当前家具库生成流程。当前流程见项目根目录的 [CATALOG.md](../CATALOG.md)。
