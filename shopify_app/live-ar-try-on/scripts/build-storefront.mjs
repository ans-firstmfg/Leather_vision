import { build } from 'esbuild';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const extension = new URL('../extensions/live-ar/', import.meta.url);
for (const [entry, name, format, budget] of [['element.ts','leather-vision-ar.js','iife',10000],['engine.ts','leather-vision-ar-engine.js','esm',30000],['handoff-ui.ts','live-ar-handoff.js','esm',30000]]) {
  const result = await build({entryPoints:[fileURLToPath(new URL('../storefront/live-ar/'+entry,import.meta.url))],bundle:true,format,minify:true,target:'es2022',write:false,legalComments:'none'});
  const output=result.outputFiles[0].contents;
  // The schema entry stays under 10 KB. The QR encoder is a separate, lazy helper.
  if(output.byteLength>budget) throw new Error(`${name} exceeds the JavaScript budget`);
  const destination = new URL('assets/'+name,extension);
  const previous = await readFile(destination).catch(error => { if(error.code==='ENOENT')return null; throw error; });
  // No-op builds must not trigger Shopify's extension watcher/rebundler.
  if(!previous || !previous.equals(Buffer.from(output)))await writeFile(destination,output);
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
