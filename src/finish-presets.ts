export type FinishPreset={id:string;name:string;color:string;texture:string;category:string;meters:number;tint?:string;normal:number;preview:string};
export type RoomFinish={wall:string;floor:string;wallColor?:string};
export const DEFAULT_SOLID_WALL_COLOR='#eeeae1';
export const SOLID_WALL_SWATCHES=[
 {name:'暖白',color:'#eeeae1'},{name:'纯白',color:'#ffffff'},{name:'奶油黄',color:'#eee2b0'},{name:'浅蓝',color:'#b7cad3'},
 {name:'灰绿',color:'#b9c2b6'},{name:'暖灰',color:'#c4bdb3'},{name:'陶土',color:'#c18f77'},{name:'炭灰',color:'#51565b'}
];
export function normalizeWallColor(value:unknown):string|null{
 if(typeof value!=='string')return null;let hex=value.trim().replace(/^#/,'');
 if(/^[0-9a-f]{3}$/i.test(hex))hex=[...hex].map(c=>c+c).join('');
 return /^[0-9a-f]{6}$/i.test(hex)?'#'+hex.toLowerCase():null;
}
export function isRoomFinish(value:unknown):value is RoomFinish{
 const f=value as RoomFinish;return !!f&&(f.wall==='solid'||WALL_COLORS.some(c=>c.id===f.wall))&&FLOOR_STYLES.some(c=>c.id===f.floor)&&(f.wallColor===undefined||typeof f.wallColor==='string'&&/^#[0-9a-f]{6}$/i.test(f.wallColor));
}
function p(id:string,name:string,color:string,texture:string,category:string,meters:number,normal=.4,tint='#ffffff'):FinishPreset{
 return {id,name,color,texture,category,meters,normal,tint,preview:`materials/previews/${id}.webp`};
}
// Keep existing IDs so saved designs continue to resolve. UV coordinates are metres.
export const WALL_COLORS:FinishPreset[]=[
 p('white','暖白细纹墙漆','#eeeae1','white_plaster_02','墙漆',2,.15,'#eeeae1'),
 p('cream','淡奶油墙漆','#e9debf','white_plaster_02','墙漆',2,.15,'#e9debf'),
 p('blue','浅蓝墙漆','#b7cad3','white_plaster_02','墙漆',2,.15,'#b7cad3'),
 p('sage','灰绿墙漆','#b9c2b6','white_plaster_02','墙漆',2,.15,'#b9c2b6'),
 p('limewash','柔白石灰涂料','#e1ded5','painted_plaster_wall','涂料',2,.3),
 p('clay','砂色泥灰涂料','#cbb994','clay_plaster','涂料',2,.4),
 p('concrete','灰色细砂墙面','#c1c2bc','grey_plaster','涂料',2,.4),
 p('white-tile','白色长条墙砖','#edecea','long_white_tiles','瓷砖',1,.55),
 p('blue-tile','淡蓝方砖','#c0d6e2','clean_square_tiles','瓷砖',1,.5,'#c0d6e2'),
 p('yellow-tile','奶油黄方砖','#eee2b0','clean_square_tiles','瓷砖',1,.5,'#eee2b0'),
 p('white-square','白色方砖','#eeeeeb','clean_square_tiles','瓷砖',1,.5),
 p('marble-wall','浅色纹理大理石','#e6e4e0','polished_marble','石材',2,.2),
 p('wood-wall','温润木饰面','#c59a6a','kitchen_wood','木饰面',1.5,.25),
 p('walnut-wall','深色木饰面','#805139','wood_table_001','木饰面',1.5,.25)
];
export const FLOOR_STYLES:FinishPreset[]=[
 p('oak','温润木地板','#bb9164','wooden_floor_01','木地板',2,.4),
 p('light-oak','浅色木地板','#d2b58e','wood_floor','木地板',2,.4),
 p('tile','浅灰方砖','#c6c5bf','clean_square_tiles','瓷砖',4.8,.5,'#c6c5bf'),
 p('terrazzo','细粒水磨石','#d7d3c8','terrazzo_tiles','水磨石',2,.35),
 p('herringbone','人字拼木地板','#ae8e68','herringbone_parquet','拼花木地板',2,.4),
 p('diagonal','斜拼木地板','#ad8964','diagonal_parquet','拼花木地板',2,.4),
 p('honey-wood','蜂蜜色木地板','#caac85','wooden_floor_01','木地板',2,.35,'#ffe4bd'),
 p('smoked-wood','烟熏色木地板','#776d61','wood_floor','木地板',2,.4,'#a1a1a1'),
 p('marble-floor','浅纹大理石','#e5e4e2','polished_marble','石材',2,.2),
 p('large-tile','仿古灰砖','#979b9b','large_grey_tiles','瓷砖',2,.4),
 p('terracotta','暖红陶砖','#ac7457','terracotta_floor_tiles','陶砖',2,.5),
 p('white-strip','白色长条地砖','#e9e8e4','long_white_tiles','瓷砖',1,.5)
];
