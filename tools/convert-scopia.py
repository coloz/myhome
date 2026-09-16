"""Blender: OBJ/MTL to meter-based, floor-origin GLB; retain attribution."""
import bpy,json,pathlib,sys,bmesh,re
from mathutils import Matrix,Vector
root=pathlib.Path(__file__).resolve().parents[1]
index_name=sys.argv[sys.argv.index('--index')+1] if '--index' in sys.argv else 'scopia-conversion.json'
records=json.loads((root/'catalog-source'/index_name).read_text('utf8'))
out=root/'public/library/models';out.mkdir(exist_ok=True)
report=[]
axis=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
for index,r in enumerate(records):
    path=out/(r['id']+'.glb')
    if path.exists() and '--force' not in sys.argv:continue
    try:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        bpy.ops.wm.obj_import(filepath=r['sourceModel'],forward_axis='NEGATIVE_Z',up_axis='Y')
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
        # OBJ libraries can contain loose vertices outside the visible surface.
        # glTF drops them; remove before measuring so the exported bounds agree.
        for o in list(meshes):
            bm=bmesh.new();bm.from_mesh(o.data)
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
            bm.to_mesh(o.data);bm.free()
            if not o.data.polygons:meshes.remove(o);bpy.data.objects.remove(o,do_unlink=True)
        rotation=Matrix([r['sourceRotation'][i:i+3] for i in range(0,9,3)])
        rot=(axis@rotation@axis.inverted()).to_4x4()
        for o in meshes:o.matrix_world=rot@o.matrix_world
        bpy.context.view_layer.update()
        points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
        low=Vector([min(v[i] for v in points) for i in range(3)]);high=Vector([max(v[i] for v in points) for i in range(3)])
        target=Vector(r['dimensions']);extent=high-low
        if min(extent)<1e-8:raise ValueError('degenerate model')
        transform=Matrix.Diagonal(Vector([target[i]/extent[i] for i in range(3)]+[1]))@Matrix.Translation(Vector((-(low.x+high.x)/2,-(low.y+high.y)/2,-low.z)))
        for o in meshes:
            # Bake directly into vertex positions. Decomposing non-uniform scale
            # plus rotation into GLTF TRS loses shear and changes nominal size.
            o.data.transform(transform@o.matrix_world);o.matrix_world=Matrix.Identity(4)
            o['source']=r['source'];o['license']=r['license'];o['creator']=r['creator']
            for mat in o.data.materials:
                if mat and mat.use_nodes:
                    shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                    if shader:
                        shader.inputs['Roughness'].default_value=max(.32,shader.inputs['Roughness'].default_value)
                        if re.search(r'steel|chrome|chromium|stainless|aluminium|aluminum|brass',mat.name,re.I):
                            shader.inputs['Metallic'].default_value=.85;shader.inputs['Roughness'].default_value=.28
        for im in bpy.data.images:
            if im.size[0]>1024 or im.size[1]>1024:
                ratio=1024/max(im.size);im.scale(max(1,int(im.size[0]*ratio)),max(1,int(im.size[1]*ratio)))
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
        report.append({'id':r['id'],'bytes':path.stat().st_size})
        bpy.data.orphans_purge(do_recursive=True)
        if index%10==0:print('CONVERTED',index,len(records),flush=True)
    except Exception as exc:report.append({'id':r['id'],'error':str(exc)});print('ERROR',r['id'],exc,flush=True)
(root/'catalog-source'/index_name.replace('.json','-report.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
