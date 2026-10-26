// Archive original matching DLL/PDB pairs privately. Never builds or executes a DLL.
import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=async file=>{const digest=crypto.createHash('sha256');for await(const bytes of createReadStream(file))digest.update(bytes);return digest.digest('hex');};
const options={};for(let index=2;index<process.argv.length;index++){
  const option=process.argv[index];if(option==='--check-only'){options.checkOnly=true;continue;}
  if(!['--dll','--pdb','--output'].includes(option)||!process.argv[index+1])throw Error('Usage: node scripts/archive-native-symbols.mjs --dll FILE.dll --pdb FILE.pdb [--output PRIVATE_DIRECTORY] [--check-only]');
  options[option.slice(2)]=path.resolve(process.argv[++index]);
}
assert(options.dll&&options.pdb,'Both --dll and --pdb are required');
assert((await fs.stat(options.dll)).size<=128*1024*1024,'DLL too large');
const image=await fs.readFile(options.dll);
const u16=offset=>{assert(offset>=0&&offset+2<=image.length,'Truncated PE');return image.readUInt16LE(offset);};
const u32=offset=>{assert(offset>=0&&offset+4<=image.length,'Truncated PE');return image.readUInt32LE(offset);};
assert.equal(image.subarray(0,2).toString(),'MZ');const pe=u32(0x3c);assert.equal(image.subarray(pe,pe+4).toString('hex'),'50450000');
const optional=pe+24,magic=u16(optional),sections=optional+u16(pe+20);
assert([0x20b,0x10b].includes(magic),'Unsupported PE');const directories=optional+(magic===0x20b?112:96);
const debugRva=u32(directories+48),debugSize=u32(directories+52);
const map=rva=>{for(let index=0;index<Math.min(u16(pe+6),96);index++){const at=sections+index*40,va=u32(at+12),size=u32(at+16);if(rva>=va&&rva-va<size)return u32(at+20)+rva-va;}throw Error('Unmapped PE debug directory');};
const debug=map(debugRva);let expected;
for(let index=0;index<Math.min(Math.floor(debugSize/28),128);index++){
  const at=debug+index*28;if(u32(at+12)!==2)continue;const record=u32(at+24);
  if(image.subarray(record,record+4).toString()!=='RSDS')continue;
  assert(record+24<=image.length,'Truncated CodeView record');expected={guid:image.subarray(record+4,record+20).toString('hex'),age:u32(record+20)};break;
}
assert(expected,'DLL does not contain an RSDS identifier');
const pdb=await fs.open(options.pdb,'r');let actual;
try {
  const metadata=await pdb.stat();
  const read=async(offset,length)=>{assert(Number.isSafeInteger(offset)&&offset>=0&&length>=0&&length<=16*1024*1024&&offset+length<=metadata.size,'Invalid PDB block');const bytes=Buffer.alloc(length);assert.equal((await pdb.read(bytes,0,length,offset)).bytesRead,length);return bytes;};
  const header=await read(0,56);assert(header.subarray(0,24).toString().startsWith('Microsoft C/C++ MSF 7.00'),'Unsupported PDB');
  const block=header.readUInt32LE(32),size=header.readUInt32LE(44),mapBlock=header.readUInt32LE(52);
  assert(block>=512&&block<=65536&&(block&(block-1))===0&&size<=16*1024*1024,'Invalid PDB layout');
  const blocks=await read(mapBlock*block,Math.ceil(size/block)*4),parts=[];
  for(let at=0;at<blocks.length;at+=4)parts.push(await read(blocks.readUInt32LE(at)*block,block));
  const directory=Buffer.concat(parts).subarray(0,size),count=directory.readUInt32LE(0);assert(count>=2&&count<100000&&4+count*4<=directory.length,'Invalid PDB streams');
  let at=4+count*4,info;
  for(let index=0;index<=1;index++){
    const streamSize=directory.readUInt32LE(4+index*4),streamBlocks=streamSize===0xffffffff?0:Math.ceil(streamSize/block);assert(at+streamBlocks*4<=directory.length,'Invalid PDB stream map');
    if(index===1){assert(streamSize>=28&&streamSize<=16*1024*1024);const values=[];for(let n=0;n<streamBlocks;n++)values.push(await read(directory.readUInt32LE(at+n*4)*block,block));info=Buffer.concat(values).subarray(0,streamSize);}at+=streamBlocks*4;
  }
  actual={guid:info.subarray(12,28).toString('hex'),age:info.readUInt32LE(8)};
} finally {await pdb.close();}
assert.deepEqual(actual,expected,'PDB GUID/age does not match DLL; do not substitute another build');
const dllHash=await hash(options.dll),pdbHash=await hash(options.pdb);
const manifest={schemaVersion:1,dll:{name:path.basename(options.dll),sha256:dllHash,bytes:(await fs.stat(options.dll)).size},pdb:{name:path.basename(options.pdb),sha256:pdbHash,bytes:(await fs.stat(options.pdb)).size,...actual},matching:true};
if(!options.checkOnly){
  const root=options.output||path.join(project,'local-builds/private-symbols');
  const relative=path.relative(project,root);assert(relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Output must stay in the workspace');
  assert(!relative.split(path.sep).some(part=>part.toLowerCase()==='web'),'Never archive symbols inside a public webroot');
  const directory=path.join(root,dllHash);await fs.mkdir(directory,{recursive:true});
  for(const [source,expectedHash]of [[options.dll,dllHash],[options.pdb,pdbHash]]){
    const destination=path.join(directory,path.basename(source));
    try{await fs.copyFile(source,destination,constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await hash(destination),expectedHash,'Immutable archive entry changed');}
  }
  const target=path.join(directory,'symbols.json');
  try{await fs.writeFile(target,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(JSON.parse(await fs.readFile(target,'utf8')),manifest);}
}
console.log(JSON.stringify({ok:true,matching:true,...expected,dllSha256:dllHash,archived:!options.checkOnly}));
