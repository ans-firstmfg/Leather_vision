import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const cache=path.resolve('.cache');await mkdir(cache,{recursive:true});
const dir=await mkdtemp(path.join(cache,'tests-'));
if(path.dirname(dir)!==cache)throw new Error('Unsafe test directory');
try {
 const outfile=path.join(dir,'live-ar.test.mjs');
 await build({entryPoints:['tests/live-ar.test.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external'});
 const result=spawnSync(process.execPath,['--test',outfile],{stdio:'inherit'});
 process.exitCode=result.status??1;
} finally {await rm(dir,{recursive:true,force:true});}
