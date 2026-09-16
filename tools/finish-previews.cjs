const fs=require('node:fs'),esbuild=require('esbuild');
const tmp='catalog-source/finish-presets.cjs';fs.writeFileSync(tmp,esbuild.transformSync(fs.readFileSync('src/finish-presets.ts','utf8'),{loader:'ts',format:'cjs'}).code);
const p=require('../'+tmp);fs.writeFileSync('public/materials/presets.json',JSON.stringify({walls:p.WALL_COLORS,floors:p.FLOOR_STYLES},null,2));
