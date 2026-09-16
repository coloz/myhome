"""Prepare attributed CC-BY furniture models for Blender conversion."""
import pathlib,zipfile,io,re,json,hashlib
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=ROOT/'catalog-source';out=ROOT/'public/library';out.mkdir(exist_ok=True)
archive=zipfile.ZipFile(source/'Scopia.zip');lib=zipfile.ZipFile(io.BytesIO(archive.read('Scopia.sh3f')))
def props(name):
    text=lib.read(name).decode('latin1');text=re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),text)
    return dict(line.split('=',1) for line in text.splitlines() if '=' in line and not line.startswith('#'))
p=props('PluginFurnitureCatalog.properties');zh=props('PluginFurnitureCatalog_zh_CN.properties')
terms={
 '沙发':r'sofa|couch|futon|day bed', '椅凳':r'chair|stool|bench|puff|hammock|bank',
 '桌子':r'table|desk', '床':r'bed|crib', '收纳':r'wardrobe|shel|bookcase|cabinet|safe|clothes.rack',
 '家电':r'fridge|freezer|washing.machine|dryer|dishwasher|oven|cooker|fryer|toaster|coffee.machine|sandwich.maker|air.conditioning|water.heater|water.cooler|hood|television|\btv\b|stereo|amplifier|projector|printer|imac|computer|playstation',
 '卫浴':r'bath|washbasin|vanity|toilet|shower|urinal', '灯具':r'lamp|light|chandelier',
 '绿植':r'ficus|fern|bonsai|bamboo|maceta'}
type_map={'沙发':'sofa','椅凳':'chair','桌子':'table','床':'bed','收纳':'cabinet','家电':'appliance','卫浴':'vanity','灯具':'lamp','绿植':'plant'}
records=[];seen=set()
for index in range(1,1000):
    get=lambda key,default='':p.get(f'{key}#{index}',default)
    if not get('id'):continue
    name=get('name');model=get('model').lstrip('/');slug=pathlib.PurePosixPath(model).parent.name
    text=name+' '+slug;category=next((cat for cat,regex in terms.items() if re.search(regex,text,re.I)),None)
    if not category or get('doorOrWindow')=='true' or get('category') in ['Vehicles','Characters','Staircases','Doors and windows']:continue
    if re.search(r'hospital|street|lightbulb|wall.seat|grab.bar|tap.for|remote|chairman|brush|comb\b|sponge|soap|plastic.bottle|towel|sugar|cream|cutlery',text,re.I):continue
    # Geometry hash also collapses paint-only variants.
    vertices='\n'.join(line for line in lib.read(model).decode('utf8','replace').splitlines() if line.startswith(('v ','f ')))
    key=hashlib.sha256(vertices.encode()).hexdigest()
    if key in seen:continue
    seen.add(key)
    dims=[float(get(k))/100 for k in ['width','depth','height']]
    rid='scopia-'+slug
    directory=(source/'scopia-obj'/slug);directory.mkdir(parents=True,exist_ok=True)
    prefix=str(pathlib.PurePosixPath(model).parent)+'/'
    for member in lib.namelist():
        if member.startswith(prefix) and not member.endswith('/'):
            relative=pathlib.PurePosixPath(member).relative_to(prefix)
            if '..' in relative.parts:raise ValueError('Unsafe archive path')
            target=directory.joinpath(*relative.parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(lib.read(member))
    thumb=out/'thumbs'/(rid+'.webp');thumb.parent.mkdir(exist_ok=True)
    im=Image.open(io.BytesIO(lib.read(get('icon').lstrip('/')))).convert('RGBA');im.thumbnail((192,192));im.save(thumb,'WEBP',quality=80)
    title=zh.get(f'name#{index}',name)
    if not re.search('[\u4e00-\u9fff]',title):title=category+' · '+name
    record={'id':rid,'name':title,'category':category,'style':'Scopia · 实体模型','brand':'Scopia','color':'#c2ac8d','type':type_map[category], 'dimensions':dims,'size':' × '.join(f'{d*100:g}' for d in dims)+' cm','image':'library/thumbs/'+rid+'.webp','model':'library/models/'+rid+'.glb','source':'https://www.sweethome3d.com/free-3d-models/','license':'CC-BY-3.0','creator':'Space Mushrooms / Scopia Visual Interfaces Systems','precision':'模型标称尺寸','elevation':float(get('elevation','0'))/100,'styleKey':key,'sourceModel':str(directory/pathlib.PurePosixPath(model).name),'sourceRotation':[float(x) for x in get('modelRotation','1 0 0 0 1 0 0 0 1').split()]}
    records.append(record)
(source/'scopia-conversion.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
(out/'SCOPIA-LICENSE.txt').write_bytes(archive.read('LICENSE.TXT'))
print('selected real furniture/appliance models:',len(records))
