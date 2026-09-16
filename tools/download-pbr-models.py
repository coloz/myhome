"""Fetch a curated list via the official Poly Haven API; cache every response.
CC0 model assets only, not copyrighted website example renders/thumbnails.
"""
from pathlib import Path
import urllib.request,json,hashlib,concurrent.futures,time,sys
root=Path(__file__).resolve().parents[1];source=root/'catalog-source';UA={'User-Agent':'HomePlannerModelResearch/1.0'}
ids=['ArmChair_01','CoffeeTable_01','GreenChair_01','Ottoman_01','Rockingchair_01','Sofa_01','WoodenChair_01','WoodenTable_01','bar_chair_round_01','chinese_armchair','chinese_cabinet','chinese_commode','chinese_console_table','chinese_sofa','chinese_stool','chinese_tea_table','coffee_table_round_01','dining_chair_02','drawer_cabinet','electric_stove','folding_wooden_stool','industrial_coffee_table','mid_century_lounge_chair','modern_arm_chair_01','modern_coffee_table_01','modern_coffee_table_02','modern_wooden_cabinet','round_wooden_table_01','round_wooden_table_02','side_table_01','sofa_02','sofa_03','vintage_cabinet_01','vintage_microwave','wooden_display_shelves_01','wooden_stool_02']
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=45) as r:return r.read()
def download(id):
    cache=source/('polyhaven-'+id+'.json')
    if not cache.exists():cache.write_bytes(fetch('https://api.polyhaven.com/files/'+id));time.sleep(.15)
    meta=json.loads(cache.read_text('utf8'));entry=meta.get('gltf',{}).get('2k',{}).get('gltf')
    if not entry:raise ValueError(id+' has no glTF')
    directory=source/'polyhaven'/id;directory.mkdir(parents=True,exist_ok=True)
    entries={id+'.gltf':entry,**entry.get('include',{})}
    for name,info in entries.items():
        dest=directory/name
        if not dest.resolve().is_relative_to(directory.resolve()):raise ValueError('unsafe path')
        dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists() and hashlib.md5(dest.read_bytes()).hexdigest()==info['md5']:continue
        if not info['url'].startswith('https://dl.polyhaven.org/'):raise ValueError('unexpected asset host')
        data=fetch(info['url'])
        if hashlib.md5(data).hexdigest()!=info['md5']:raise ValueError('checksum mismatch')
        dest.write_bytes(data)
    print('DOWNLOADED',id,flush=True);return id
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:done=list(pool.map(download,ids))
    (source/'polyhaven-selected.json').write_text(json.dumps(done,indent=2),encoding='utf8')
