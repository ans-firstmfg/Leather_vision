import { build } from 'esbuild';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const extension = new URL('../extensions/live-ar/', import.meta.url);
for (const [entry, name, format] of [['element.ts','leather-vision-ar.js','iife'],['engine.ts','leather-vision-ar-engine.js','esm']]) {
  const result = await build({entryPoints:[fileURLToPath(new URL('../storefront/live-ar/'+entry,import.meta.url))],bundle:true,format,minify:true,target:'es2022',write:false,legalComments:'none'});
  const output=result.outputFiles[0].contents;
  if(output.byteLength>10000) throw new Error(`${name} exceeds the JavaScript budget`);
  await writeFile(new URL('assets/'+name,extension),output);
}
const keys=value=>Object.values(value).reduce((n,v)=>n+(v && typeof v==='object'?keys(v):1),0);
let liquid=0,total=0;
for(const f of await readdir(extension,{recursive:true})) {
  const url=new URL(f.replaceAll('\\','/'),extension);
  if(!(await stat(url)).isFile())continue;
  const data=await readFile(url);total+=data.length;
  if(f.endsWith('.liquid'))liquid+=data.length;
  if(/^locales[\\/]/.test(f) && (data.length>15000||keys(JSON.parse(data))>250))throw new Error(`Locale limit: ${f}`);
}
if(liquid>100000||total>10000000)throw new Error('Theme extension size limit exceeded');
console.log(`Live AR built: ${liquid} Liquid bytes, ${total} total bytes.`);
