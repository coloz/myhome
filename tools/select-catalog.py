import pathlib,json,collections,sys
sys.stdout.reconfigure(encoding='utf8')
root=pathlib.Path(__file__).resolve().parents[1]/'catalog-source'
allowed='trolleys|grills|sink and wash basins|high cabinets|base cabinets|wall cabinets|shelves|open storage solutions|storage combinations|side tables|hobs|dishwashers|fridges and freezers|fans|ovens|microwave ovens|tables|clothes and shoe racks|chest of drawers|bookcases and display cabinets|wardrobes|sofas outdoor|benches|chairs|media furniture|stools|armchairs|room dividers|bed frames|footstools|mirrors|chaise longues|sofas|drying racks|sofa beds|desks|wall lamps|changing tables|ceiling lamps|bed frames with mattress|media electronics|floor lamps|household electronics|clamp lamp|table and work lamps'.split('|')
articles={}
for f in root.glob('search-*.json'):
    for p in json.loads(f.read_text('utf8'))['items']:articles[p['id']]=p
groups=collections.defaultdict(list)
for p in articles.values():
    if p.get('filterClass') in allowed:
        # Colour and dimension text are intentionally absent from the style key.
        groups[(p['name'],p['typeName'])].append(p)
candidates=[]
for key,variants in sorted(groups.items()):
    variants.sort(key=lambda p:p['id'])
    p=dict(variants[0]);p['variants']=variants;candidates.append(p)
(root/'candidates.json').write_text(json.dumps(candidates,ensure_ascii=False),encoding='utf8')
print('style groups',len(candidates),'articles',sum(len(x['variants']) for x in candidates))
print(collections.Counter(x.get('filterClass') for x in candidates))
