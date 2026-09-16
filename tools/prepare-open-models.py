"""Import furniture from the public Sweet Home 3D Kator / Blend Swap libraries.

Keeps each creator, per-model license notice and original link. No downloads
from gated model endpoints; run after downloading the three official ZIPs.
"""
import pathlib, zipfile, io, re, json, hashlib, collections, html, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf8')
ROOT=pathlib.Path(__file__).resolve().parents[1]
src=ROOT/'catalog-source'; out=ROOT/'public/library'
collections_info=[('KatorLegaz','kator','Kator Legaz','CC-BY-3.0-US'),
                  ('BlendSwap-CC-0','blend0','Blend Swap','CC0-1.0'),
                  ('BlendSwap-CC-BY','blendby','Blend Swap','CC-BY-3.0')]
rules=[('收纳','cabinet',r'bedside|nightstand|wardrobe|shel[fv]|bookcase|cabinet|dresser|sideboard|cupboard|chest.of.drawers|tv.stand'),
       ('沙发','sofa',r'sofa|couch|futon'),('椅凳','chair',r'chair|stool|bench|ottoman|pouf|lounge'),
       ('桌子','table',r'table|desk'),('床','bed',r'\bbed\b|bunk.bed|bed[0-9]|bedwith|crib'),
       ('家电','appliance',r'refrigerator|fridge|freezer|washing.machine|dryer|dishwasher|microwave|oven|stove|cooker|fryer|toaster|coffee.machine|coffeemaker|espresso|kettle|boiler|radiator|air.condition|fan\b|hood|television|\btv\b|vacuum|blender|mixer|speaker|stereo'),
       ('厨卫','vanity',r'bathtub|\bbath\b|washbasin|wash.basin|washstand|sink|toilet|shower'),
       ('灯具','lamp',r'lamp|chandelier|pendant.light|ceiling.light')]
records=[]; rejected=[]; seen={r['styleKey'] for r in json.loads((src/'scopia-conversion.json').read_text('utf8'))}
def properties(lib,name):
    if name not in lib.namelist():return {}
    text=lib.read(name).decode('latin1')
    text=re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),text)
    return dict(line.split('=',1) for line in text.splitlines() if '=' in line and not line.startswith('#'))
for archive_name,prefix,brand,license_id in collections_info:
    archive=zipfile.ZipFile(src/(archive_name+'.zip'))
    lib=zipfile.ZipFile(io.BytesIO(archive.read(archive_name+'.sh3f')))
    p=properties(lib,'PluginFurnitureCatalog.properties'); zh=properties(lib,'PluginFurnitureCatalog_zh_CN.properties')
    source_url='https://sourceforge.net/projects/sweethome3d/files/SweetHome3D-models/3DModels-1.9.3/3DModels-'+archive_name+'-1.9.3.zip/download'
    (out/(archive_name+'-LICENSE.txt')).write_bytes(archive.read('LICENSE.TXT'))
    for i in range(1,1000):
        get=lambda key,default='':p.get(f'{key}#{i}',default)
        if not get('id'):continue
        name=get('name');model=get('model').lstrip('/');slug=pathlib.PurePosixPath(model).parent.name
        text=re.sub(r'([a-z])([A-Z])',r'\1 \2',name+' '+slug)
        match=next((r for r in rules if re.search(r[2],text,re.I)),None)
        if re.search(r'lamp|chandelier|pendant.light|ceiling.light',text,re.I):match=('灯具','lamp','')
        elif re.search(r'(?:table|ceiling|rigged).?fan',text,re.I):match=('家电','appliance','')
        if not match or get('category') in ['Vehicles','Characters','Staircases','Doors and windows'] or get('doorOrWindow')=='true':continue
        if re.search(r'paper|tissue|park.light|lamppost|street|gym|abdominal|weight.bench|bench.press|hospital|toilet.brush|tableware|ceiling.fan.blade|opened|open.sofa|table.tennis|soccer',text,re.I):continue
        if not model.endswith('.obj'):rejected.append({'id':get('id'),'reason':'not OBJ'});continue
        vertices='\n'.join(line for line in lib.read(model).decode('utf8','replace').splitlines() if line.startswith(('v ','f ')))
        shape=hashlib.sha256(vertices.encode()).hexdigest()
        if shape in seen:rejected.append({'id':get('id'),'reason':'same geometry'});continue
        seen.add(shape)
        category,kind,_=match
        dims=[float(get(k))/100 for k in ['width','depth','height']]
        if not all(.01<=d<=6 for d in dims):rejected.append({'id':get('id'),'reason':'outlier dimensions'});continue
        rid=prefix+'-'+slug;directory=src/'open-obj'/rid;directory.mkdir(parents=True,exist_ok=True)
        folder=str(pathlib.PurePosixPath(model).parent)+'/'
        notices=[]
        for member in lib.namelist():
            if not member.startswith(folder) or member.endswith('/'):continue
            relative=pathlib.PurePosixPath(member).relative_to(folder)
            if '..' in relative.parts:raise ValueError('unsafe archive path')
            safe_parts=[re.sub(r'[<>:"|?*]','_',part) for part in relative.parts]
            dest=directory.joinpath(*safe_parts);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(lib.read(member))
            if re.search(r'license|readme|copyright',member,re.I):notices.append(lib.read(member).decode('utf8','replace'))
        license_text='\n\n'.join(notices) or archive.read('LICENSE.TXT').decode('utf8','replace')
        (out/'licenses').mkdir(exist_ok=True)
        (out/'licenses'/(rid+'.txt')).write_text(license_text,encoding='utf8')
        creator='Andrew Kator & Jennifer Legaz' if prefix=='kator' else get('creator','Blend Swap contributors')
        links=[re.sub(r'^http:','https:',url) for url in re.findall(r'https?://(?:www\.)?blendswap\.com/(?:blends/view|blend)/[0-9]+',license_text)]
        thumb=out/'thumbs'/(rid+'.webp');thumb.parent.mkdir(exist_ok=True)
        im=Image.open(io.BytesIO(lib.read(get('icon').lstrip('/')))).convert('RGBA');im.thumbnail((192,192));im.save(thumb,'WEBP',quality=85)
        title=zh.get(f'name#{i}',name)
        if name=='Bath':title='浴缸'
        translations={'Blender':'料理机','Boiler':'电水壶','Ceiling fan':'吊扇','Double oven':'双层烤箱','Large fridge':'双门冰箱','Large stove':'多头灶具','Mixer':'厨师机','Radiator':'暖气片','Range hood':'抽油烟机','Refrigerator':'冰箱','Rigged fan':'落地风扇','Table fan':'台式风扇','Speaker':'音箱','Stove':'灶具','TV':'平板电视','Washing machine':'洗衣机','Baby bed':'婴儿床','Child bed':'儿童床','Bookcase':'书柜','Cupboard':'储物柜','Drawers cabinet':'抽屉柜','Dresser with drawers':'多屉斗柜','Glass door cabinet':'玻璃门展示柜','High cabinet':'高柜','Lower cabinet':'地柜','Lower corner cabinet':'转角地柜','Sink cabinet':'水槽柜','Small lower cabinet':'窄地柜','Small upper cabinet':'窄吊柜','TV stand':'电视柜','Television cabinet':'电视柜','Upper cabinet':'吊柜','Upper corner cabinet':'转角吊柜','Upper shelves cabinet':'开放吊柜','Vertical shelves':'立式搁架','Wardrobe':'衣柜','Shower curtain':'浴帘','Shower head and faucet':'淋浴花洒','Shower stall':'淋浴房','Toilet unit':'坐便器','Propane stove':'燃气灶','Full bookcase':'开放书柜','Armchair':'休闲椅','Desk':'书桌','Football table':'桌式足球台','Oak table':'橡木餐桌','Pool table':'台球桌','Table with tablecloth':'带桌布餐桌','Technical table':'工作台'}
        if not re.search('[\u4e00-\u9fff]',title):title=translations.get(name,title)
        if 'mid-century' in slug:title='中古'+('长椅沙发' if 'bench-sofa' in slug else '沙发' if 'sofa' in slug else '休闲椅')
        if not re.search('[\u4e00-\u9fff]',title):title=category+' · '+name
        records.append({'id':rid,'name':title,'description':name,'category':category,'type':kind,'brand':brand,'style':brand+' · 实体模型','color':'#c2ac8d','dimensions':dims,'size':' × '.join(f'{d*100:g}' for d in dims)+' cm','image':'library/thumbs/'+rid+'.webp','model':'library/models/'+rid+'.glb','source':links[0] if links else source_url,'license':license_id,'licenseFile':'library/licenses/'+rid+'.txt','creator':creator,'precision':'原模型库标称尺寸 · 非品牌实测','elevation':float(get('elevation','0'))/100,'styleKey':shape,'sourceModel':str(directory/pathlib.PurePosixPath(model).name),'sourceRotation':[float(x) for x in get('modelRotation','1 0 0 0 1 0 0 0 1').split()]})
(src/'open-models-conversion.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
(src/'open-models-selection.json').write_text(json.dumps({'accepted':len(records),'collections':dict(collections.Counter(r['brand'] for r in records)),'rejected':rejected},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'accepted':len(records),'categories':dict(collections.Counter(r['category'] for r in records))},ensure_ascii=False))
