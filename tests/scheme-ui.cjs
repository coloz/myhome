async function openSchemes(page){
 if(await page.evaluate(()=>matchMedia('(max-width:700px)').matches)&&await page.getByRole('button',{name:'方案与房间',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'方案与房间',exact:true}).click();
 if(await page.locator('.scheme-section-toggle').getAttribute('aria-expanded')==='false')await page.locator('.scheme-section-toggle').click();
 await page.getByRole('listbox',{name:'切换家装方案',exact:true}).waitFor();
}
async function selectScheme(page,id){
 await openSchemes(page);
 await page.locator('.scheme-file[data-scheme-id="'+id+'"]').click();
 await page.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId===id&&!document.querySelector('.loading'),id,{timeout:120000});
}
module.exports={openSchemes,selectScheme};
