import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {rememberImagePath,restoreImagePaths} from '../src/client/image-paths.js';
test('only original paths persist; deleting the source removes the image',()=>{
 const dir=mkdtempSync(join(tmpdir(),'grok-path-test-')),prior=process.env.GROK_TUI_PROFILE_DIR;
 process.env.GROK_TUI_PROFILE_DIR=dir;
 try {
  const path=join(dir,'original.png');writeFileSync(path,'original bytes');
  rememberImagePath('bot','/remote/image.png',path);
  const turns=[{id:'one',role:'user',text:'[Image #1] hello',images:[{file_path:'/remote/image.png'}]}];
  assert.equal(restoreImagePaths('bot',turns)[0].images[0].path,path);
  assert(!readFileSync(join(dir,'image-paths.json'),'utf8').includes('original bytes'));
  assert.equal(restoreImagePaths('other',turns)[0].images.length,0);
  rmSync(path);
  const restored=restoreImagePaths('bot',turns)[0];
  assert.equal(restored.images.length,0);assert.equal(restored.text,'hello');
 } finally {if(prior===undefined)delete process.env.GROK_TUI_PROFILE_DIR;else process.env.GROK_TUI_PROFILE_DIR=prior;rmSync(dir,{recursive:true,force:true});}
});
