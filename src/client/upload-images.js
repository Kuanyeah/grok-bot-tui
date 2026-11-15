import {readFile,stat} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import {backendCall} from './server-send.js';

export async function uploadImages(agentId, images, signal, call=backendCall, put=fetch) {
    const paths=[], names=[];
    for(const image of images) {
        const file=image.path;
        const info=await stat(file);
        if(!info.isFile() || info.size>20*1024*1024) throw new Error('Image must be a file no larger than 20 MB');
        const bytes=await readFile(file), name=basename(file);
        const begin=await call('BeginGrokBotAttachmentUpload',{
            agentId,fileName:name,sizeBytes:String(bytes.length),supportsStoreAttachmentRefs:true,
            supportsMultipart:false,sha256Hex:createHash('sha256').update(bytes).digest('hex'),
        },signal);
        const token=begin.uploadToken;
        try {
            if(begin.mode!==2 && !String(begin.mode).endsWith('SINGLE_PUT')) {
                throw new Error('Image upload unavailable for this bot: '+(begin.refusal||begin.mode));
            }
            if(!token || !begin.put?.url) throw new Error('Missing upload destination');
            const url=new URL(begin.put.url);
            if(url.protocol!=='https:' || /^(localhost|127\.|\[|0\.)/.test(url.hostname)) throw new Error('Unexpected upload destination');
            const response=await put(url,{method:'PUT',headers:begin.put.headers||{},body:bytes,redirect:'error',
                signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
            if(!response.ok) throw new Error('Image upload failed: HTTP '+response.status);
            const complete=await call('CompleteGrokBotAttachmentUpload',{uploadToken:token},signal);
            if(!complete.alias || (complete.refusal && complete.refusal!==0 && !String(complete.refusal).endsWith('UNSPECIFIED'))) throw new Error('Image upload was not completed');
            paths.push(complete.alias);names.push(name);
        } catch(error) {
            if(token) await call('AbortGrokBotAttachmentUpload',{uploadToken:token}).catch(()=>{});
            throw error;
        }
    }
    return {attachmentPaths:paths,attachmentNames:names};
}
