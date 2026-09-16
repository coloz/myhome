"""Original seamless PBR surfaces for clean interiors, including real grout relief."""
from pathlib import Path
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[1]/'public/materials';N=1024
rng=np.random.default_rng(72);y,x=np.mgrid[0:N,0:N].astype(float);u=x/N;v=y/N
def save(name,color,height,rough,meters):
    p=R/name;p.mkdir(exist_ok=True)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))/(2*meters/N)
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))/(2*meters/N)
    normals=np.stack([-dx,dy,np.ones_like(dx)],axis=-1);normals/=np.linalg.norm(normals,axis=-1)[...,None]
    for key,a in [('color',color),('normal',normals*.5+.5),('roughness',rough)]:
        Image.fromarray(np.uint8(np.clip(a,0,1)*255)).save(p/(key+'.jpg'),quality=95,subsampling=0)
dist=np.minimum.reduce([x%128,127-x%128,y%128,127-y%128]);edge=np.clip((dist-1.2)/2.5,0,1);edge=edge*edge*(3-2*edge)
cells=rng.uniform(-.012,.012,(8,8))[(y//128).astype(int),(x//128).astype(int)]
noise=rng.normal(0,.0014,(N,N));glaze=.955+cells+noise
color=(.79*(1-edge)+glaze*edge)[...,None]*np.ones(3)
height=.0015*edge+.000007*np.sin(u*2*np.pi*31)*np.cos(v*2*np.pi*29)*edge
rough=.76*(1-edge)+(.23+cells*.4+noise*3)*edge
save('clean_square_tiles',color,height,rough,1)
# Periodic multiscale distortion creates mineral veins, not a repeated grid.
field=np.zeros((N,N))
for frequency,amp in [(1,1),(2,.48),(4,.22),(8,.10),(16,.045),(32,.015)]:
    phase=rng.uniform(0,2*np.pi,4)
    field+=amp*(np.sin(2*np.pi*(u*frequency+v*(frequency+1))+phase[0])+.5*np.sin(2*np.pi*(v*frequency-u*(frequency+1))+phase[1]))
vein=np.exp(-np.abs(field)*90)*.25+np.exp(-np.abs(field)*14)*.045
color=np.stack([.944-vein,.943-vein,.927-vein*.91],axis=-1)+rng.normal(0,.0008,(N,N,1))
save('polished_marble',color,-vein*.000025,.22+vein*.12,2)
(R/'AUTHORED.html').write_text('<!doctype html><meta charset="utf-8"><title>原创釉面砖与石纹</title><style>body{font:16px/1.8 system-ui;max-width:800px;margin:40px auto}</style><h1>原创材质</h1><p>清洁釉面方砖：包括釉面微起伏、圆角砖边、下凹填缝和不同表面粗糙度。默认每片 1 米贴图包含 8×8 块砖；地面灰砖使用 4.8 米尺度，单块约 60 cm。</p><p>浅色抛光石纹：多尺度连续矿物纹路，包含颜色、细微凹凸和粗糙度通道。它是通用材质设计，不指代天然石板或特定品牌。</p><p>两类贴图均为本项目程序生成，源脚本 tools/build-clean-finishes.py。可以随项目离线使用。</p>',encoding='utf8')
print('Created clean tile and polished stone PBR maps')
