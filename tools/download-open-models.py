"""Download only the public archives linked by Sweet Home 3D's model directory."""
from pathlib import Path
import urllib.request,zipfile,concurrent.futures
root=Path(__file__).resolve().parents[1]/'catalog-source';root.mkdir(exist_ok=True)
def download(name):
    target=root/(name+'.zip')
    if target.exists():
        with zipfile.ZipFile(target) as archive:assert 'LICENSE.TXT' in archive.namelist()
        print(name,'cached',flush=True);return
    url='https://downloads.sourceforge.net/project/sweethome3d/SweetHome3D-models/3DModels-1.9.3/3DModels-'+name+'-1.9.3.zip'
    temporary=target.with_suffix('.download')
    with urllib.request.urlopen(url,timeout=60) as response,temporary.open('wb') as file:
        while chunk:=response.read(1024*1024):file.write(chunk)
    with zipfile.ZipFile(temporary) as archive:assert 'LICENSE.TXT' in archive.namelist()
    temporary.replace(target);print(name,target.stat().st_size,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(download,['Scopia','KatorLegaz','BlendSwap-CC-0','BlendSwap-CC-BY']))
