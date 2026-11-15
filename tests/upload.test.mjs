import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {uploadImages} from '../src/client/upload-images.js';
test('uploads bytes with signed headers and returns server alias',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grok-upload-'));
 try {
 const file=join(dir,'test.png');await writeFile(file,Buffer.from([1,2,3]));
 const calls=[];
 const call=async(method,body)=>{calls.push({method,body});return method.startsWith('Begin')?{mode:2,uploadToken:'token',put:{url:'https://storage.example/image',headers:{'x-upload':'signed'}}}:{alias:'store:image',refusal:0};};
 const result=await uploadImages('bot',[{path:file}],undefined,call,async(url,options)=>{assert.deepEqual([...options.body],[1,2,3]);assert.deepEqual(options.headers,{'x-upload':'signed'});return {ok:true};});
 assert.deepEqual(result,{attachmentPaths:['store:image'],attachmentNames:['test.png']});
 assert.equal(calls[0].body.sizeBytes,'3');
 await assert.rejects(uploadImages('bot',[{path:file}],undefined,async()=>({mode:1}),async()=>{throw Error('must not upload');}),/unavailable/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
