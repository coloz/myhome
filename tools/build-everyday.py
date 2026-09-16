"""Authored everyday furniture: finished joinery, hardware, UVs and physical materials.
Run with Blender --background --python tools/build-everyday.py. Z up, front -Y.
These are specified generic designs, not claimed reproductions of branded products.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];OUT=R/'public/library/models';SRC=R/'catalog-source/authored';SRC.mkdir(exist_ok=True)
random.seed(42);pi=math.pi
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.5,metal=0,tex=None,diff=True):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if tex:
        for key,socket in [('color','Base Color'),('roughness','Roughness'),('normal','Normal')]:
            if key=='color' and not diff:continue
            file=next((R/'public/materials'/tex).glob(key+'.*'));im=bpy.data.images.load(str(file),check_existing=True);im.pack()
            if key!='color':im.colorspace_settings.name='Non-Color'
            node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
            if key=='normal':
                normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.22 if 'fabric' in tex else .38;m.node_tree.links.new(node.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs[0],p.inputs[socket])
            else:m.node_tree.links.new(node.outputs['Color'],p.inputs[socket])
    return m
WOOD=mat('橡木 · 连续木纹与微表面',(.7,.5,.3),tex='kitchen_wood');DARK=mat('胡桃木 · 清漆木纹',(.3,.15,.05),tex='wood_table_001')
WHITE=mat('暖白烤漆',(.87,.86,.81),.28);BLACK=mat('炭黑粉末涂层',(.022,.026,.03),.4);STEEL=mat('拉丝不锈钢',(.62,.65,.68),.27,.95);CHROME=mat('镀铬五金',(.77,.8,.83),.16,1);BRASS=mat('拉丝黄铜',(.6,.37,.13),.28,.85)
FABRIC=mat('米白织物 · 经纬法线',(.88,.85,.78),.85,tex='denim_fabric',diff=False);BLUE=mat('浅蓝织物 · 经纬法线',(.43,.6,.69),.88,tex='denim_fabric',diff=False)
LEATHER=mat('黑皮革 · 表面颗粒',(.025,.022,.019),.5,tex='leather_white',diff=False);RUBBER=mat('脚垫与密封圈',(.035,.035,.034),.92)
GLASS=mat('透明钢化玻璃',(.86,.94,.97),.08);p=GLASS.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.47;p.inputs['Alpha'].default_value=.38
CERAMIC=mat('白色釉面陶瓷',(.93,.92,.89),.17)
objects=[]
def finish(o,name,m):
    o.name=name;o.data.materials.append(m);objects.append(o);return o
def uv_project(o,scale=.7):
    mesh=o.data;uv=mesh.uv_layers.active or mesh.uv_layers.new();offset=(random.random(),random.random())
    for f in mesh.polygons:
        axis=max(range(3),key=lambda a:abs(f.normal[a]));a,b=((1,2) if axis==0 else (0,2) if axis==1 else (0,1))
        for idx in f.loop_indices:
            co=mesh.vertices[mesh.loops[idx].vertex_index].co;uv.data[idx].uv=(co[a]/scale+offset[0],co[b]/scale+offset[1])
def box(name,loc,dims,m=WOOD,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);uv_project(o)
    if bevel:
        mod=o.modifiers.new('实体倒角','BEVEL');mod.width=min(bevel,min(dims)*.35);mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons:p.use_smooth=True
        n=o.modifiers.new('加权法线','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name)
    return finish(o,name,m)
def cyl(name,loc,r,h,m=STEEL,r2=None,axis=(0,0,1),verts=40):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=h,location=loc);o=bpy.context.object;o.rotation_euler=Vector((0,0,1)).rotation_difference(Vector(axis)).to_euler()
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return finish(o,name,m)
def rod(name,a,b,r=.008,m=STEEL):
    a,b=Vector(a),Vector(b);return cyl(name,(a+b)/2,r,(b-a).length,m,axis=b-a)
def tube(name,pts,r=.008,m=CHROME,closed=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=3;curve.resolution_u=12
    s=curve.splines.new('POLY');s.points.add(len(pts)-1)
    for p,co in zip(s.points,pts):p.co=(*co,1)
    s.use_cyclic_u=closed;o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');return finish(bpy.context.object,name,m)
def screw(loc,axis=(0,-1,0)):
    cyl('十字螺钉头',loc,.0048,.0018,STEEL,axis=axis,verts=24)
    if abs(axis[1])>.8:
        box('螺钉十字槽',(loc[0],loc[1]-.0014,loc[2]),(.006,.0005,.001),BLACK,.0001);box('螺钉十字槽',(loc[0],loc[1]-.0014,loc[2]),(.001,.0005,.006),BLACK,.0001)
def handle(x,y,z,w=.14,m=BRASS):
    rod('拉手立柱',(x-w/2,y,z),(x-w/2,y-.027,z),.005,m);rod('拉手立柱',(x+w/2,y,z),(x+w/2,y-.027,z),.005,m);rod('圆角金属拉手',(x-w/2,y-.027,z),(x+w/2,y-.027,z),.006,m)
def feet(w,d,h=.12,m=WOOD):
    for x in [-w/2+.055,w/2-.055]:
        for y in [-d/2+.055,d/2-.055]:cyl('收分柜脚',(x,y,h/2+.008),.022,h,m,.032);cyl('防滑脚垫',(x,y,.006),.024,.012,RUBBER)
def carcass(w,d,h,bottom=.1,m=WOOD,back=True,top=True):
    t=.018;box('左侧板',(-w/2+t/2,0,(h+bottom)/2),(t,d,h-bottom),m);box('右侧板',(w/2-t/2,0,(h+bottom)/2),(t,d,h-bottom),m);box('底板',(0,0,bottom+t/2),(w-.036,d,t),m)
    if top:box('顶板',(0,0,h-t/2),(w,d,t),m)
    if back:box('嵌入式背板',(0,d/2-.008,(h+bottom)/2),(w-.036,.009,h-bottom-.028),m,.001)
def shelf(w,d,z,m=WOOD):box('可调层板',(0,-.002,z),(w-.04,d-.025,.018),m)
def pins(w,d,z):
    for x in [-w/2+.02,w/2-.02]:
        for y in [-d/2+.06,d/2-.05]:
            cyl('层板托销',(x,y,z-.008),.003,.011,STEEL,axis=(1,0,0),verts=16)
def drawer(x,y,z,w,h,d=.38,m=WOOD):
    box('抽屉独立面板',(x,y,z),(w-.004,.018,h-.004),m);box('抽屉底板',(x,y+d/2+.017,z-h/2+.017),(w-.03,d,.012),WOOD,.001)
    for side in [-1,1]:box('抽屉侧帮',(x+side*(w/2-.025),y+d/2+.014,z),(.012,d,h-.026),WOOD,.001);box('抽屉金属滑轨',(x+side*(w/2-.018),y+d/2+.014,z-h/2+.03),(.008,d-.025,.014),STEEL,.002)
    handle(x,y-.011,z,w=min(w*.4,.18))
def door(x,y,z,w,h,m=WHITE,ajar=0):
    start=len(objects);box('平板柜门',(x,y,z),(w-.004,.019,h-.006),m);handle(x+w*.32,y-.012,z,w=.13)
    for dz in [-h*.32,h*.32]:
        box('铰链座',(x-w/2+.03,y+.017,z+dz),(.045,.035,.042),STEEL,.004);cyl('阻尼铰链轴',(x-w/2+.022,y+.025,z+dz),.008,.05,STEEL);screw((x-w/2+.032,y+.003,z+dz))
    if ajar:
        pivot=Vector((x-w/2,y,z));angle=math.radians(ajar)
        for o in objects[start:]:q=o.location-pivot;o.location=pivot+Vector((q.x*math.cos(angle)-q.y*math.sin(angle),q.x*math.sin(angle)+q.y*math.cos(angle),q.z));o.rotation_euler.z+=angle
def soft(name,loc,dims,m=FABRIC):
    # Rounded, bulging textile form with subtle gathered-edge ripples.
    verts=[];faces=[];nu,nv=64,32;powr=lambda a,e:math.copysign(abs(a)**e,a)
    for j in range(nv+1):
        v=-pi/2+pi*j/nv
        for i in range(nu):
            u=2*pi*i/nu;x=powr(math.cos(v),.35)*powr(math.cos(u),.3);y=powr(math.cos(v),.35)*powr(math.sin(u),.3);z=powr(math.sin(v),.55)
            ripple=.008*math.sin(18*u+9*v)*abs(math.sin(v))**4
            verts.append((loc[0]+x*dims[0]/2,loc[1]+y*dims[1]/2,loc[2]+(z+ripple)*dims[2]/2))
    for j in range(nv):
        for i in range(nu):a=j*nu+i;b=j*nu+(i+1)%nu;faces.append((a,b,b+nu,a+nu))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);uv_project(o,.3)
    for p in mesh.polygons:p.use_smooth=True
    finish(o,name,m)
    pts=[]
    for i in range(128):u=2*pi*i/128;pts.append((loc[0]+powr(math.cos(u),.3)*dims[0]/2,loc[1]+powr(math.sin(u),.3)*dims[1]/2,loc[2]))
    tube('软包滚边接缝',pts,.0025,m,True);return o
def desk(standing=False):
    w,d,h=(1.4,.7,.75) if standing else (1.2,.6,.75)
    box('厚实圆角桌面',(0,0,h-.014),(w,d,.028),WOOD,.009)
    if standing:
        for x in [-.5,.5]:
            box('升降桌脚横梁',(x,0,.03),(.085,.62,.045),WHITE,.014);box('电动升降外立柱',(x,0,.33),(.08,.07,.57),WHITE,.009);box('伸缩内立柱',(x,0,.59),(.065,.055,.25),STEEL,.005);box('桌面安装支架',(x,0,.717),(.13,.49,.022),WHITE)
            for y in [-.27,.27]:cyl('可调平脚垫',(x,y,.009),.026,.018,RUBBER)
        box('中央横梁',(0,.1,.68),(1.04,.065,.075),WHITE);box('线缆托盘',(0,.22,.66),(.65,.16,.02),BLACK);box('高度控制面板',(.46,-.358,.707),(.14,.026,.026),BLACK)
        for x in [.42,.455,.49]:box('控制按键',(x,-.373,.709),(.012,.003,.007),WHITE,.001)
    else:
        for x in [-.53,.53]:
            for y in [-.23,.23]:cyl('锥形桌腿',(x,y,.359),.021,.704,WOOD,.033);cyl('桌腿脚垫',(x,y,.004),.021,.008,RUBBER)
        box('桌底围板',(0,.22,.674),(1.05,.025,.1),WOOD);drawer(.26,-.297,.65,.46,.12,.38)
    cyl('理线孔护圈',(-w/2+.15,d/2-.09,h+.0005),.026,.003,BLACK);cyl('理线孔开口',(-w/2+.15,d/2-.09,h+.002),.019,.003,RUBBER)
    for x in [-w/2+.08,w/2-.08]:screw((x,-d/2+.003,h-.05))
def storage(kind):
    if kind=='wardrobe':
        w,d,h=1.2,.6,2.2;carcass(w,d,h,.08,WHITE);box('中隔板',(0,0,1.14),(.018,.57,2.08),WHITE);shelf(w,d,1.89);rod('镀铬挂衣杆',(-.54,.04,1.7),(-.02,.04,1.7),.013,CHROME)
        for z in [.5,.95,1.38]:box('右侧收纳层板',(.3,0,z),(.56,.55,.018),WOOD)
        door(-.3,-.3,1.142,.594,2.07,WOOD,ajar=-12);door(.3,-.3,1.142,.594,2.07,WHITE)
        box('内收踢脚板',(0,-.258,.04),(1.13,.022,.078),BLACK)
    elif kind=='sliding':
        w,d,h=1.6,.62,2.2;carcass(w,d,h,.08,WHITE)
        for z in [.095,2.18]:
            for y in [-.294,-.268]:box('推拉门导轨',(0,y,z),(1.55,.012,.014),STEEL)
        for x,y,m in [(-.397,-.307,WOOD),(.397,-.285,WHITE)]:box('推拉独立门扇',(x,y,1.14),(.79,.02,2.05),m);box('嵌入式竖拉手',(x+.34,y-.018,1.14),(.022,.018,.52),STEEL,.005)
        for z in [.62,1.24,1.82]:shelf(w,d,z)
    elif kind=='bookcase':
        w,d,h=.8,.3,1.85;carcass(w,d,h,.06)
        for z in [.41,.76,1.11,1.46]:shelf(w,d,z);pins(w,d,z)
        for x in [-.38,.38]:
            for z in [.29+i*.065 for i in range(22)]:cyl('调节孔位',(x,-.08,z),.002,.002,BLACK,axis=(1,0,0),verts=12)
    elif kind=='cube':
        w,d,h=1.22,.36,1.23;carcass(w,d,h,.07,WHITE)
        for z in [.455,.84]:shelf(w,d,z,WHITE)
        for x in [-.2,.2]:box('竖向格板',(x,0,.65),(.018,.34,1.14),WHITE)
        for x in [-.402,.402]:drawer(x,-.182,.27,.385,.365,.30,WOOD)
    elif kind=='chest':
        w,d,h=.8,.45,1.05;carcass(w,d,h,.13);feet(w,d)
        for i in range(4):drawer(0,-.23,.25+i*.226,.762,.219,.38,WHITE)
    elif kind=='bedside':
        w,d,h=.45,.4,.53;carcass(w,d,h,.12);feet(w,d,.11);drawer(0,-.203,.427,.412,.172,.32);shelf(w,d,.335)
    elif kind=='shoe':
        w,d,h=.8,.28,1.13;carcass(w,d,h,.1,WHITE)
        for z in [.27,.6,.93]:drawer(0,-.142,z,.758,.315,.20,WOOD)
        for x in [-.31+i*.031 for i in range(21)]:box('鞋柜通风凹缝',(x,-.153,.145),(.003,.003,.07),BLACK,.001)
    elif kind=='tv':
        w,d,h=1.8,.4,.49;carcass(w,d,h,.15);feet(w,d,.14);shelf(w,d,.31)
        for x in [-.32,.32]:box('设备仓隔板',(x,0,.32),(.018,.37,.3),WOOD)
        for x in [-.604,.604]:drawer(x,-.206,.323,.575,.287,.33,WHITE)
        cyl('背板理线圈',(0,.185,.3),.035,.008,BLACK,axis=(0,1,0))
def bed(single=False):
    w=1.28 if single else 1.88;d=2.1
    feet(w,d,.16);carcass(w,d,.36,.18,WOOD,back=False)
    for y in [-.88+i*.115 for i in range(16)]:box('排骨床板',(0,y,.335),(w-.06,.085,.016),WOOD,.004)
    box('床头板',(0,.993,.77),(w,.075,1.16),WOOD,.024)
    if single:
        for x in [-.29,.29]:soft('分片软包床头',(x,.939,.85),(.555,.08,.68),BLUE)
    soft('包边床垫',(0,-.022,.455),(w-.075,1.99,.22),FABRIC)
    for x in ([0] if single else [-.44,.44]):soft('鼓起枕头',(x,.61,.62),(.66,.41,.17),FABRIC)
    # Duvet drapes over the side and foot instead of remaining a rectangular slab.
    nx,ny=60,65;verts=[];faces=[]
    for j in range(ny+1):
        y=-1.04+j*1.51/ny
        for i in range(nx+1):
            x=-w/2+i*w/nx;edge=max(0,(abs(x)-(w/2-.13))/.13);foot=max(0,(-y-.88)/.16)
            z=.583-.17*edge**2-.12*foot**2+.013*math.sin(23*x+6*y)*math.sin(8*y)+.009*math.sin(43*x+9*y)
            verts.append((x,y,z))
    for j in range(ny):
        for i in range(nx):a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new('被子褶皱');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('真实起伏被面',mesh);bpy.context.collection.objects.link(o);uv_project(o,.35)
    for p in mesh.polygons:p.use_smooth=True
    finish(o,'真实起伏被面',BLUE if not single else FABRIC);solid=o.modifiers.new('被子包边厚度','SOLIDIFY');solid.thickness=.009;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    tube('被子上沿包边',[verts[ny*(nx+1)+i] for i in range(nx+1)],.005,FABRIC)
def sofa():
    feet(1.95,.89,.14,DARK);soft('沙发下框',(0,0,.29),(1.97,.91,.28));soft('沙发靠背',(0,.345,.66),(1.98,.23,.67))
    for x in [-.92,.92]:soft('饱满扶手',(x,-.008,.49),(.21,.87,.46))
    for x in [-.435,.435]:soft('独立坐垫',(x,-.085,.455),(.846,.70,.20));soft('松软背垫',(x,.22,.79),(.84,.21,.5))
def chair(cantilever=False):
    if cantilever:
        for x in [-.235,.235]:
            pts=[(x,.22,.018),(x,-.22,.018)]+[(x,-.22-.035*math.sin(t),.055-.037*math.cos(t)) for t in [i*pi/16 for i in range(9)]]+[(x,-.257,.39)]+[(x,-.22-.037*math.cos(t),.39+.037*math.sin(t)) for t in [i*pi/16 for i in range(9)]]+[(x,.19,.427),(x,.24,.81)]
            tube('连续弯折钢管椅架',pts,.013,CHROME);box('底脚防滑条',(x,0,.008),(.034,.28,.015),RUBBER,.004)
        soft('皮革坐垫',(0,-.025,.457),(.48,.46,.062),LEATHER);soft('皮革背垫',(0,.228,.68),(.47,.06,.28),LEATHER)
        for x in [-.19,.19]:screw((x,.194,.61));screw((x,.194,.76))
    else:
        for x in [-.207,.207]:
            for y in [-.205,.205]:rod('实木倾斜椅腿',(x*1.12,y*1.08,.017),(x*.91,y*.91,.455),.022,WOOD);cyl('椅脚软垫',(x*1.12,y*1.08,.008),.022,.016,RUBBER)
        box('弧边座框',(0,0,.435),(.46,.455,.028),WOOD,.025);soft('织物椅面',(0,-.008,.465),(.43,.415,.066))
        for x in [-.198,.198]:rod('后背立柱',(x,.196,.425),(x,.24,.81),.018,WOOD)
        vs=[];faces=[]
        for i in range(33):
            x=-.24+i*.48/32;y=.265-.65*x*x
            for dy,dz in [(-.013,-.039),(.013,-.039),(.013,.039),(-.013,.039)]:vs.append((x,y+dy,.78+dz))
        for i in range(32):
            for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
        faces.extend([(3,2,1,0),(128,129,130,131)])
        mesh=bpy.data.meshes.new('弯曲实木靠背截面');mesh.from_pydata(vs,[],faces);mesh.update();o=bpy.data.objects.new('弧形薄板椅背',mesh);bpy.context.collection.objects.link(o);uv_project(o);finish(o,'弧形薄板椅背',WOOD)
        mod=o.modifiers.new('靠背圆润边缘','BEVEL');mod.width=.005;mod.segments=3
        for f in mesh.polygons:f.use_smooth=True
        for y in [-.2,.2]:rod('横向加固撑',(-.21,y,.27),(.21,y,.27),.012,WOOD)
def table(kind):
    if kind=='square':
        w,d,h=.7,.7,.36;box('正方形薄台面',(0,0,h-.014),(w,d,.028),BLACK,.013)
        for x in [-.312,.312]:
            for y in [-.312,.312]:box('圆角茶几桌腿',(x,y,.166),(.035,.035,.326),BLACK,.009);cyl('脚垫',(x,y,.003),.016,.006,RUBBER)
        for y in [-.304,.304]:box('台面下沿连接梁',(0,y,.31),(.62,.024,.035),BLACK);screw((-.24,y-.014,.31));screw((.24,y-.014,.31))
    elif kind=='glass':
        cyl('12mm透明玻璃桌面',(0,0,.744),.54,.012,GLASS,verts=128)
        for a in [0,pi/2,pi,pi*1.5]:
            rod('放射形镀铬桌腿',(math.cos(a)*.34,math.sin(a)*.34,.025),(math.cos(a)*.18,math.sin(a)*.18,.72),.017,CHROME);cyl('玻璃固定垫',(math.cos(a)*.2,math.sin(a)*.2,.734),.025,.008,RUBBER);cyl('落地脚垫',(math.cos(a)*.34,math.sin(a)*.34,.011),.028,.022,RUBBER)
        cyl('金属联结套',(0,0,.33),.055,.16,CHROME)
        for a in [0,pi/2,pi,pi*1.5]:rod('联结支撑',(0,0,.33),(math.cos(a)*.27,math.sin(a)*.27,.33),.015,CHROME)
    elif kind=='dining':
        box('圆角实木餐桌面',(0,0,.742),(1.4,.8,.032),WOOD,.018)
        for x in [-.61,.61]:
            for y in [-.31,.31]:cyl('锥形餐桌腿',(x,y,.365),.025,.72,WOOD,.045);cyl('毛毡脚垫',(x,y,.004),.025,.008,RUBBER)
        for y in [-.3,.3]:box('餐桌围板',(0,y,.675),(1.22,.028,.085),WOOD)
def bench():
    for y in [-.135,-.045,.045,.135]:box('分片实木座板',(0,y,.443),(1.1,.084,.03),WOOD,.007)
    for x in [-.43,.43]:
        for y in [-.12,.12]:rod('长凳外撇脚',(x,y*1.3,.012),(x*.95,y,.426),.024,WOOD);cyl('长凳脚垫',(x,y*1.3,.006),.025,.012,RUBBER)
        box('长凳横撑',(x,0,.4),(.06,.35,.035),WOOD)
    rod('座下中央横档',(-.43,0,.22),(.43,0,.22),.017,WOOD)
def trolley():
    for x in [-.31,.31]:
        for y in [-.19,.19]:
            rod('推车立柱',(x,y,.095),(x,y,.87),.012,STEEL);cyl('万向轮轮胎',(x,y,.04),.038,.026,RUBBER,axis=(1,0,0));cyl('轮毂',(x-.016,y,.04),.014,.007,STEEL,axis=(1,0,0));box('万向轮叉架',(x+.02,y,.068),(.008,.027,.062),STEEL);cyl('转向轴承',(x,y,.10),.023,.018,STEEL)
    for z in [.16,.47,.78]:box('带护边托盘',(0,0,z),(.65,.42,.021),WOOD);box('托盘背护边',(0,.201,z+.035),(.65,.018,.06),WOOD);box('左护边',(-.316,0,z+.035),(.018,.4,.06),WOOD);box('右护边',(.316,0,z+.035),(.018,.4,.06),WOOD)
    rod('推车手柄',(-.31,.19,.87),(.31,.19,.87),.014,STEEL)
def pegboard():
    panel=box('实体洞洞板',(0,0,.42),(.6,.021,.8),WHITE,.003);cutters=[]
    for i in range(11):
        for j in range(15):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.008,depth=.04,location=(-.25+i*.05,0,.07+j*.05),rotation=(pi/2,0,0));cutters.append(bpy.context.object)
    bpy.ops.object.select_all(action='DESELECT')
    for o in cutters:o.select_set(True)
    bpy.context.view_layer.objects.active=cutters[0];bpy.ops.object.join();cut=bpy.context.object;bpy.context.view_layer.objects.active=panel
    mod=panel.modifiers.new('165个贯穿开孔','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    for x in [-.27,.27]:
        for z in [.065,.775]:cyl('离墙安装垫柱',(x,.021,z),.016,.026,STEEL,axis=(0,1,0));screw((x,-.012,z))
    for x in [-.2,0,.2]:tube('可插拔挂钩',[(x,0,.52),(x,-.045,.52),(x,-.055,.5),(x,-.055,.45),(x,-.045,.442)],.003,STEEL)
    box('置物托板',(0,-.083,.265),(.42,.15,.015),WOOD);box('托板前沿',(0,-.151,.28),(.42,.012,.04),WOOD)
def kitchen(sink=False):
    w=.9 if sink else .6;d=.6;h=.86;carcass(w,d,.835,.10,WOOD,top=not sink);box('踢脚空间背衬',(0,-.24,.05),(w-.04,.025,.10),BLACK)
    if not sink:
        box('拉丝钢工作台',(0,0,.85),(w+.004,.606,.02),STEEL,.003)
        for z,hh in [(.69,.275),(.407,.277),(.181,.16)]:drawer(0,-.306,z,w-.038,hh,.51)
    else:
        # Four rims leave a real countertop cutout; a formed basin has an interior.
        for x in [-.352,.352]:box('水槽左右台面',(x,0,.85),(.196,.606,.02),STEEL)
        for y in [-.254,.254]:box('水槽前后台面',(0,y,.85),(.51,.098,.02),STEEL)
        box('水槽盆底',(0,0,.65),(.506,.41,.015),STEEL,.012)
        for x in [-.251,.251]:box('成型盆壁',(x,0,.751),(.014,.416,.19),STEEL,.005)
        for y in [-.204,.204]:box('成型盆壁',(0,y,.751),(.50,.014,.19),STEEL,.005)
        cyl('落水口',(0,.02,.66),.032,.005,BLACK);cyl('下水滤篮',(0,.02,.663),.026,.006,STEEL)
        for i in range(12):a=i*pi/6;cyl('滤篮排水孔',(.019*math.cos(a),.02+.019*math.sin(a),.667),.002,.001,BLACK,verts=12)
        tube('高抛弯管水龙头',[(0,.263,.855),(0,.263,1.08)]+[(0,.17+.093*math.cos(t),1.08+.093*math.sin(t)) for t in [i*pi/28 for i in range(29)]]+[(0,.077,1.042)],.012,CHROME)
        cyl('龙头底座',(0,.263,.86),.027,.014,CHROME);rod('龙头控制手柄',(.034,.263,.89),(.034,.263,.96),.005,CHROME)
        for x in [-.221,.221]:door(x,-.303,.475,.435,.73,WOOD)
records=[]
def save(id,name,category,typ,styles,builder,details):
    global objects
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);objects=[];builder()
    bpy.context.view_layer.update();points=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box];lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    for o in objects:o.location-=center;o['detailPart']=o.name
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    file=OUT/(id+'.glb');bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_image_format='AUTO',export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(id+'.blend')))
    dims=list(hi-lo);record={'id':id,'name':name,'category':category,'type':typ,'typeTags':[typ],'styleTags':styles,'style':' · '.join(styles),'color':'#c3a17a','brand':'原创精细模型','description':'；'.join(details),'dimensions':dims,'size':' × '.join(f'{v*100:.1f}' for v in dims)+' cm','precision':'原创设计尺寸 · 可按需缩放','model':'library/models/'+id+'.glb','modelBytes':file.stat().st_size,'quality':'原创建模 · 倒角 / 五金 / PBR','source':'library/AUTHORED.html','creator':'家装模拟器 · 原创建模','license':'原创模型；纹理 CC0-1.0','styleKey':id,'constructionDetails':details,'parts':len(objects),'materialMaps':sum(1 for m in set(o.active_material for o in objects) for n in m.node_tree.nodes if n.type=='TEX_IMAGE'),'elevation':.9 if id=='detail-pegboard' else 0}
    assert file.stat().st_size<20*1024*1024;records.append(record);print('AUTHORED',id,len(objects),flush=True)
for kind,name,category,tag in [('wardrobe','橡木暖白双门衣柜','收纳','衣柜'),('sliding','窄轨推拉衣柜','收纳','衣柜'),('bookcase','橡木可调层板书柜','收纳','书柜'),('cube','九格抽屉收纳柜','收纳','格子柜'),('chest','细脚四斗抽屉柜','收纳','抽屉柜'),('bedside','开放格床头柜','收纳','床头柜'),('shoe','窄进深三层鞋柜','收纳','鞋柜'),('tv','钢琴白橡木电视柜','收纳','电视柜')]:
    save('detail-'+kind,name,category,tag,['简约现代','北欧'],lambda k=kind:storage(k),['18mm独立板件与倒角','柜门/抽屉接缝','层板、拉手或滑轨五金','木纹颜色 / 法线 / 粗糙度'])
save('detail-desk','抽屉实木书桌','桌子','书桌',['北欧','简约现代'],desk,['28mm倒角桌面','独立抽屉与滑轨','锥形腿与脚垫','金属拉手、理线孔'])
save('detail-standing-desk','双柱电动升降桌','桌子','升降桌',['简约现代'],lambda:desk(True),['两节伸缩立柱','升降控制器与按键','线缆托盘','调平脚垫、桌面安装支架'])
save('detail-bed-oak','橡木双人床与浅蓝床品','床','双人床',['北欧','简约现代'],bed,['实木床头与排骨架','包边床垫','鼓起枕头及滚边','真实起伏与下垂被面'])
save('detail-bed-single','软包靠背单人床','床','单人床',['简约现代'],lambda:bed(True),['分片软包床头','排骨架与床垫包边','织物微表面','下垂被面与褶皱'])
save('detail-sofa','米白宽扶手双人沙发','沙发','直排沙发',['简约现代','中古'],sofa,['饱满软包曲面','独立坐垫与松软靠垫','逐件滚边缝线','隐藏木脚与织物法线'])
save('detail-oak-chair','橡木弧背软座餐椅','椅凳','餐椅',['北欧','中古'],chair,['弧形实木椅背','倾斜锥形腿','座框与横向加固撑','织物软垫与滚边'])
save('detail-cantilever','镀铬悬臂皮革餐椅','椅凳','餐椅',['包豪斯','简约现代'],lambda:chair(True),['连续弯折钢管','皮革坐背垫','可见连接螺钉','底脚防滑条'])
save('detail-square-table','黑色圆角正方茶几','桌子','茶几',['包豪斯','简约现代'],lambda:table('square'),['70cm正方台面','台面与桌腿圆角','下沿连接梁与螺钉','落地脚垫'])
save('detail-glass-table','透明玻璃圆餐桌','桌子','餐桌',['包豪斯','简约现代'],lambda:table('glass'),['12mm玻璃厚度','放射形镀铬支架','玻璃固定垫','联结套与支撑'])
save('detail-dining-table','圆角橡木四人餐桌','桌子','餐桌',['北欧','简约现代'],lambda:table('dining'),['32mm实体倒角台面','锥形桌腿','桌底围板','毛毡脚垫'])
save('detail-bench','橡木分片换鞋长凳','椅凳','长凳',['北欧','简约现代'],bench,['四片圆角座板','外撇实木脚','中央横档与横撑','独立脚垫'])
save('detail-trolley','三层钢木收纳推车','收纳','收纳推车',['工业风','简约现代'],trolley,['三层带护边托盘','轮胎、轮毂与叉架','万向轴承','独立金属手柄'])
save('detail-pegboard','穿孔洞洞板与挂件','收纳','洞洞板',['简约现代'],pegboard,['165个实际贯穿孔','离墙安装柱和螺钉','金属插拔挂钩','整体移动的木托板'])
save('detail-kitchen-base','不锈钢台面三抽地柜','厨卫','厨房地柜',['简约现代'],kitchen,['独立不锈钢台面','三抽面板和滑轨','实体板件与金属拉手','内收踢脚空间'])
save('detail-kitchen-sink','不锈钢水槽双门地柜','厨卫','水槽柜',['简约现代'],lambda:kitchen(True),['台面真实开口','下沉盆腔、落水滤篮','高抛龙头与控制手柄','门缝和阻尼铰链'])
(R/'catalog-source/authored-candidates.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8');print('FINISHED',len(records),flush=True)
