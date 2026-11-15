import {existsSync, readFileSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, isAbsolute} from 'node:path';

// Store references only. Image bytes remain in the user's original files.
function registryFile() {
    return join(process.env.GROK_TUI_PROFILE_DIR || join(homedir(), '.config/grokbot-tui'), 'image-paths.json');
}
function readRegistry() {
    try { return JSON.parse(readFileSync(registryFile(), 'utf8')); } catch { return {}; }
}
export function rememberImagePath(agentId, alias, path) {
    if (!alias || !isAbsolute(path)) return;
    const registry = readRegistry();
    registry[agentId] = {...registry[agentId], [alias]:path};
    const file = registryFile();
    mkdirSync(join(file, '..'), {recursive:true, mode:0o700});
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(registry), {mode:0o600});
    renameSync(temp, file);
}
export function restoreImagePaths(agentId, turns) {
    const refs = readRegistry()[agentId] || {};
    return turns.map(turn => ({...turn, ...(turn.images ? {text:turn.text.replace(/\[Image #\d+\]/g, '').trim(), images:turn.images.map(image => {
        const candidates = [image.path, image.file_path, ...(image.attachmentPaths || [])];
        const original = candidates.map(ref => refs[ref]).find(Boolean);
        const path = original || candidates.find(ref => ref && isAbsolute(ref) && existsSync(ref));
        return {...image, path:path && existsSync(path) ? path : undefined};
    }).filter(image => image.path)} : {})}));
}
