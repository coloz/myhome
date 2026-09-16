"""Build auditable style records from measured products and attributed model files."""
import pathlib,json,re,hashlib,collections,sys
sys.stdout.reconfigure(encoding='utf8')
ROOT=pathlib.Path(__file__).resolve().parents[1];source=ROOT/'catalog-source';out=ROOT/'public/library'
TYPES={
 'sofas':('沙发','sofa','直排沙发'),'sofas outdoor':('沙发','sofa','户外沙发'),'sofa beds':('沙发','sofa','沙发床'),
 'armchairs':('椅凳','armchair','休闲椅'),'chairs':('椅凳','chair','座椅'),'stools':('椅凳','stool','凳子'),'benches':('椅凳','bench','长凳'),'footstools':('椅凳','stool','脚凳'),'chaise longues':('椅凳','armchair','躺椅'),
 'side tables':('桌子','table','边桌/茶几'),'tables':('桌子','dining','餐桌'),'desks':('桌子','desk','书桌'),
 'bed frames':('床','bed','床架'),'bed frames with mattress':('床','bed','床'),'changing tables':('床','cabinet','尿布台'),
 'wardrobes':('收纳','wardrobe','衣柜'),'chest of drawers':('收纳','cabinet','斗柜'),'media furniture':('收纳','cabinet','电视柜'),'bookcases and display cabinets':('收纳','shelf','书柜/展示柜'),'shelves':('收纳','shelf','搁架'),'open storage solutions':('收纳','shelf','开放收纳'),'storage combinations':('收纳','cabinet','储物组合'),'clothes and shoe racks':('收纳','rack','衣帽/鞋架'),'trolleys':('收纳','shelf','推车'),'drying racks':('收纳','rack','晾衣架'),'room dividers':('收纳','shelf','隔断'),
 'base cabinets':('厨卫','kitchen','地柜'),'wall cabinets':('厨卫','cabinet','吊柜'),'high cabinets':('厨卫','wardrobe','厨房高柜'),'sink and wash basins':('厨卫','vanity','水槽/洗脸盆'),
 'hobs':('家电','appliance','灶具'),'dishwashers':('家电','appliance','洗碗机'),'fridges and freezers':('家电','appliance','冰箱/冷柜'),'ovens':('家电','appliance','烤箱'),'microwave ovens':('家电','appliance','微波炉'),'fans':('家电','appliance','抽油烟机'),'media electronics':('家电','appliance','影音设备'),'household electronics':('家电','appliance','家用电器'),'grills':('家电','appliance','烧烤炉'),
 'ceiling lamps':('灯具','lamp','吊灯/吸顶灯'),'wall lamps':('灯具','lamp','壁灯'),'table and work lamps':('灯具','lamp','台灯'),'floor lamps':('灯具','lamp','落地灯'),'clamp lamp':('灯具','lamp','夹灯'),'mirrors':('装饰','mirror','镜子')}

def style_tags(text):
    tags=[]
    rules=[('中古',r'POÄNG|DYVLINGE|EKENÄSET|STOCKHOLM|STRANDMON|LANDSKRONA|MORABO|EKET|mid.century|rattan|藤|中古'),('包豪斯',r'FRÖSET|DYVLINGE|LÖVBACKEN|chrome|tubular|metal.glass|镀铬|包豪斯'),('北欧',r'LISABO|SKOGSTA|YNGVAR|NORDEN|NORDKISA|NÄMMARÖ|PINNTORP|木|wood|teck|teak|birch'),('工业风',r'FJÄLLBO|BROR|HYLLIS|VITTSJÖ|铁|industrial|iron|steel'),('传统经典',r'HEMNES|HAUGA|HAVSTA|IDANÄS|SONGESAND|GULLABERG|TYSSEDAL|cherry|classic|traditional|复古'),('简约现代',r'BESTÅ|PAX|PLATSA|KALLAX|BILLY|MALM|ALEX|LACK|METOD|VOXTORP|简约|现代|modern|contemporary')]
    for label,pattern in rules:
        if re.search(pattern,text,re.I):tags.append(label)
    return tags or ['简约现代']

def dimensions(measurements,kind):
    values={label:float(re.match(r'[\d.]+',value.replace(',','.'))[0])/({'毫米':1000,'厘米':100,'米':1}[re.search(r'毫米|厘米|米',value)[0]]) for label,value in measurements}
    w=values.get('宽度');d=values.get('深度');h=values.get('高度')
    length=values.get('长度');diameter=values.get('直径')
    if kind in ['table','desk','dining'] and length and w and not d:w,d=length,w
    elif length and not d:d=length
    if diameter:w=w or diameter;d=d or diameter
    if kind=='bed' and not h:h=max(values.get('床头板高',0),values.get('床头板高度',0),values.get('床尾板高',0)) or None
    if kind=='shelf' and not h:h=values.get('厚度')
    if not all(v and .003<=v<=8 for v in [w,d,h]):return None,values
    return [round(w,4),round(d,4),round(h,4)],values

records=[];excluded=[];merged=0
for p in json.loads((source/'candidates.json').read_text('utf8')):
    category,kind,type_tag=TYPES[p['filterClass']]
    path=source/'measurements'/(p['id']+'.json')
    if not path.exists():continue
    facts=json.loads(path.read_text('utf8'));dims,measures=dimensions(facts.get('measurements',[]),kind)
    if not dims:excluded.append({'id':p['id'],'reason':'assembled width/depth/height incomplete','measurements':facts.get('measurements',[])});continue
    key=p['name']+'|'+p['typeName'];rid='ikea-'+hashlib.sha256(key.encode()).hexdigest()[:16]
    variants=[]
    for v in p['variants']:
        if v['itemMeasureReferenceText']!=p['itemMeasureReferenceText']:continue
        color=next(('#'+c['hex'] for c in v.get('colors',[]) if c.get('hex')),'#c2b29a')
        variants.append({'article':v['itemNo'],'name':v.get('validDesignText','标准款'),'color':color,'source':v['pipUrl']})
    merged+=len(p['variants'])-1
    # Further type labels refine broad seller classes without creating extra styles.
    extra=[]
    for label,pattern in [('转椅','转椅|旋转'),('办公椅','办公|电脑椅|电竞'),('餐椅','餐椅'),('茶几','茶几'),('儿童家具','儿童|婴儿'),('沙发床','沙发床'),('贵妃沙发','贵妃'),('圆桌','圆桌|圆形桌')]:
        if re.search(pattern,p['typeName']):extra.append(label)
    if not variants:raise ValueError('missing representative')
    records.append({'id':rid,'name':p['name']+' '+p['typeName'],'series':p['name'],'description':p['typeName'],'article':p['itemNo'],'category':category,'type':kind,'typeTags':list(dict.fromkeys([type_tag]+extra)),'styleTags':style_tags(p['name']+' '+p['typeName']),'brand':'IKEA','style':'宜家 · 尺寸示意','color':variants[0]['color'],'dimensions':dims,'size':' × '.join(f'{d*100:g}' for d in dims)+' cm','image':p['mainImageUrl'],'source':p['pipUrl'],'precision':'官方成品尺寸 · 外形简化','creator':'Home Planner，按宜家公开尺寸制作','license':'原创尺寸示意模型；商品图片及商标归宜家','styleKey':key,'variants':variants,'measures':measures,'elevation':max(0,3-dims[2]) if p['filterClass']=='ceiling lamps' else min(1.4,max(0,3-dims[2])) if p['filterClass'] in ['wall lamps','wall cabinets'] else 0})

ikea_count=len(records)
model_records=json.loads((source/'scopia-conversion.json').read_text('utf8'))
if (source/'open-models-conversion.json').exists():model_records+=json.loads((source/'open-models-conversion.json').read_text('utf8'))
for r in model_records:
    if not (ROOT/'public'/r['model']).exists():continue
    if 'opened' in r['id']:continue
    r={k:v for k,v in r.items() if k not in ['sourceModel','sourceRotation']}
    if r['category']=='卫浴':r['category']='厨卫'
    r['typeTags']=[r['category']]
    name=re.sub(r'([a-z])([A-Z])',r'\1 \2',r['id']+' '+r['name']+' '+r.get('description',''))
    specific=[('冰箱/冷柜','fridge|freezer'),('洗衣机','washing.machine'),('烘干机','dryer'),('洗碗机','dishwasher'),('空调','air.conditioning'),('微波炉/烤箱','oven'),('咖啡机','coffee.machine'),('电视','flat.tv|scopia-tv'),('抽油烟机','hood'),('转椅','office.chair'),('书桌','desk'),('沙发','sofa'),('床','bed'),('餐椅','chair'),('茶几','coffee.table')]
    specific=[('床头柜',r'bedside|nightstand'),('衣柜',r'wardrobe'),('斗柜',r'dresser|chest.of.drawers'),('书柜/展示柜',r'bookcase|bookshelf'),('沙发',r'sofa|couch|futon'),('休闲椅',r'armchair|arm.chair|lounge.chair|rocking.chair'),('办公椅',r'office.chair'),('凳子',r'stool|ottoman|pouf'),('长凳',r'bench'),('茶几',r'coffee.table|couch.table'),('书桌',r'desk'),('餐桌',r'dining.table'),('冰箱/冷柜',r'refrigerator|fridge|freezer'),('洗衣机',r'washing.machine'),('烘干机',r'dryer'),('洗碗机',r'dishwasher'),('空调',r'air.condition'),('微波炉',r'microwave'),('烤箱',r'oven'),('灶具',r'stove|cooker'),('咖啡机',r'coffee.machine|coffeemaker|espresso'),('电水壶',r'kettle|boiler'),('烤面包机',r'toaster'),('吸尘器',r'vacuum'),('音箱',r'speaker|stereo'),('暖气',r'radiator'),('电视',r'television|flat.tv|scopia-tv'),('抽油烟机',r'hood'),('马桶',r'toilet'),('浴缸',r'bathtub|\bbath\b'),('淋浴',r'shower'),('水槽/洗脸盆',r'sink|washbasin|wash.basin')]
    r['typeTags']=[label for label,pat in specific if re.search(pat,name,re.I)] or [r['category']]
    r['styleTags']=style_tags(name)
    records.append(r)
records.sort(key=lambda r:(not bool(r.get('model')),r['category'],r['name']))
out.mkdir(exist_ok=True)
manifest={'version':1,'updated':'2026-09-16','items':records}
(out/'catalog.v1.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf8')
report={'styles':len(records),'ikeaStyles':ikea_count,'licensedGlbStyles':len(records)-ikea_count,'modelSources':dict(collections.Counter(r['brand'] for r in records if r.get('model'))),'mergedIkeaArticles':merged,'excludedIncompleteDimensions':len(excluded),'categories':dict(collections.Counter(r['category'] for r in records)),'countsExcludeLegacyPalette':True,'grouping':'IKEA series + product type, all colours and sizes merged. Licensed identical source geometry merged across libraries; opened-state variant excluded.','measurementPolicy':'Product assembled dimension section, never package measurements. Downloaded model catalogue nominal dimensions are explicitly labelled.','modelPolicy':'IKEA authored dimensional approximations, not official replicas. Scopia, Kator Legaz and Blend Swap OBJ/MTL converted with Blender, dimension normalized, maximum texture edge 1024.'}
(out/'catalog-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
(source/'excluded-dimensions.json').write_text(json.dumps(excluded,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
