"""Cache official CC0 assets; model previews are generated locally, never copied."""
from pathlib import Path
import json,concurrent.futures,hashlib,urllib.request,importlib.util
root=Path(__file__).resolve().parents[1];source=root/'catalog-source'
spec=importlib.util.spec_from_file_location('download_models',Path(__file__).with_name('download-pbr-models.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
models=['metal_office_desk','steel_frame_shelves_01','steel_frame_shelves_02','steel_frame_shelves_03','desk_lamp_arm_01','modern_ceiling_lamp_01','painted_wooden_bench','SchoolChair_01','painted_wooden_chair_01','wooden_table_02']
textures=['wooden_floor_01','herringbone_parquet','diagonal_parquet','wood_floor','terrazzo_tiles','marble_01','large_grey_tiles','terracotta_floor_tiles','long_white_tiles','square_tiles','white_plaster_02','grey_plaster','clay_plaster','painted_plaster_wall','wood_table_001','fine_grained_wood','denim_fabric','leather_white','kitchen_wood']
def texture(id):
    cache=source/('polyhaven-'+id+'.json')
    if not cache.exists():cache.write_bytes(mod.fetch('https://api.polyhaven.com/files/'+id))
    meta=json.loads(cache.read_text('utf8'));folder=root/'public/materials'/id;folder.mkdir(parents=True,exist_ok=True)
    maps={}
    for key,name in [('Diffuse','color'),('nor_gl','normal'),('Rough','roughness')]:
        fmt=meta[key]['1k'];info=fmt.get('jpg') or fmt.get('png');assert info and info['url'].startswith('https://dl.polyhaven.org/')
        ext=Path(info['url']).suffix;p=folder/(name+ext)
        if not p.exists() or hashlib.md5(p.read_bytes()).hexdigest()!=info['md5']:
            data=mod.fetch(info['url']);assert hashlib.md5(data).hexdigest()==info['md5'];p.write_bytes(data)
        maps[name]=str(p.relative_to(root/'public')).replace('\\','/')
    print('TEXTURE',id,flush=True);return {'id':id,'source':'https://polyhaven.com/a/'+id,'license':'CC0-1.0','maps':maps}
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs=[pool.submit(mod.download,i) for i in models]+[pool.submit(texture,i) for i in textures]
        done=[j.result() for j in jobs]
    (source/'everyday-online-selected.json').write_text(json.dumps(models),encoding='utf8')
    (root/'public/materials/sources.json').write_text(json.dumps(done[len(models):],indent=2),encoding='utf8')
