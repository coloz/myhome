"""Collect public IKEA CN catalogue facts; resumable, bounded requests, no model credentials.

Raw product descriptions/images are not copied into a redistributable asset pack.
Only product identification, measurement facts and original source links are retained.
"""
import concurrent.futures, hashlib, html, json, pathlib, re, sys, time, urllib.request

sys.stdout.reconfigure(encoding='utf8')
ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / 'catalog-source'
CACHE.mkdir(exist_ok=True)
HEADERS = {'Content-Type': 'application/json', 'User-Agent': 'HomePlanner/1.0 (personal space planning)'}

def request(url, body=None):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as response:
                return response.read().decode('utf8')
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403): raise
            if exc.code == 404: return ''
            time.sleep(3 * (attempt + 1))
        except (OSError, TimeoutError): time.sleep(2 * (attempt + 1))
    return ''

def search():
    all_items = {}
    queries = ['家具','沙发','椅子','桌子','床','灯','厨房','电器','镜子','浴室','户外']
    for query in queries:
        offset = 0
        while True:
            path = CACHE / f'search-{query}-{offset}.json'
            if path.exists(): data=json.loads(path.read_text('utf8'))
            else:
                body={'searchParameters':{'input':query,'type':'QUERY'},'components':[{'component':'PRIMARY_AREA','columns':4,'types':{'main':'PRODUCT','breakouts':[]},'window':{'offset':offset,'size':50}}]}
                raw=request('https://sik.search.blue.cdtapps.com/cn/zh/search?c=sr&v=20210322',body)
                if not raw: break
                b=json.loads(raw)['results'][0]
                data={'total':b['metadata']['max'],'items':[{k:p[k] for k in ['id','itemNo','name','typeName','itemMeasureReferenceText','pipUrl','mainImageUrl','colors','validDesignText','categoryPath','filterClass'] if k in p} for e in b['items'] if (p:=e.get('product'))]}
                path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf8')
                time.sleep(.35)
            for p in data['items']: all_items[p['id']]=p
            offset += 50
            if offset % 250 == 0: print(f'search {query}: {offset}/{data["total"]}, unique articles {len(all_items)}',flush=True)
            if not data['items'] or offset >= data['total']: break
        print(f'finished {query}, unique articles {len(all_items)}',flush=True)
    (CACHE/'articles.json').write_text(json.dumps(list(all_items.values()),ensure_ascii=False),encoding='utf8')

def measurements(product):
    path=CACHE / 'measurements' / (product['id']+'.json')
    if path.exists(): return json.loads(path.read_text('utf8'))
    try:
        raw=request(product['pipUrl'])
        # Extract the product size section only. Packaging dimensions are deliberately excluded.
        start=raw.find('商品尺寸</')
        end=raw.find('包装信息',start)
        section=raw[start:end] if start>=0 and end>start else ''
        pairs=re.findall(r'<div[^>]*>([^<>]+)</div>\s*<div[^>]*>([\d.,]+\s*(?:厘米|毫米|米))</div>',section)
        data={'article':product['id'],'source':product['pipUrl'],'measurements':[[html.unescape(a),b] for a,b in pairs], 'checked':'2026-09-16'}
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf8')
        time.sleep(.35)
        return data
    except Exception as exc:
        return {'article':product['id'],'error':str(exc)}

if __name__=='__main__':
    if len(sys.argv)==1 or sys.argv[1]=='search': search()
    elif sys.argv[1]=='measure':
        items=json.loads((CACHE/'candidates.json').read_text('utf8'))
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for index,result in enumerate(pool.map(measurements,items)):
                if index % 25 == 0: print('measurements',index,'/',len(items),result['article'],flush=True)
