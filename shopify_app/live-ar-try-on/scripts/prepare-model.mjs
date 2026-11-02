import { readFile, writeFile } from 'node:fs/promises';
const binary=await readFile(new URL('../models/white-mesh.glb',import.meta.url));
if(binary.readUInt32LE(0)!==0x46546c67||binary.readUInt32LE(4)!==2||binary.readUInt32LE(8)!==binary.length)throw new Error('Invalid GLB 2 container');
let json,buffer;
for(let offset=12;offset<binary.length;){const length=binary.readUInt32LE(offset),type=binary.readUInt32LE(offset+4);offset+=8;if(offset+length>binary.length)throw new Error('Truncated GLB');const chunk=binary.subarray(offset,offset+length);if(type===0x4e4f534a)json=JSON.parse(chunk.toString());if(type===0x004e4942)buffer=chunk;offset+=length;}
if(!json||!buffer||json.buffers?.length!==1||json.buffers[0].uri)throw new Error('Expected self-contained single-buffer GLB');
json.buffers[0].uri='data:application/octet-stream;base64,'+buffer.subarray(0,json.buffers[0].byteLength).toString('base64');
const destination=new URL('../extensions/live-ar/assets/white-mesh.gltf.json',import.meta.url);
const content=Buffer.from(JSON.stringify(json));const previous=await readFile(destination).catch(()=>null);
if(!previous?.equals(content))await writeFile(destination,content);
console.log(`Prepared equivalent self-contained glTF JSON: ${content.length} bytes. Original GLB preserved in models/.`);
