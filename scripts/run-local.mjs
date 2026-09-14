import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2]||'dev';
if(!['dev','build','start'].includes(mode))throw Error('Use dev, build ou start.');
const port=process.env.GUICHE_PORT||'5173';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw Error('Porta inválida.');
const args=mode==='build'?['build','--webpack']:[mode,...(mode==='dev'?['--webpack']:[]),'--hostname','127.0.0.1','--port',port];
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),...args],{
 cwd:root,stdio:'inherit',env:{...process.env,GUICHE_LOCAL:'1',GUICHE_BUILD:mode==='build'?'1':'0',GUICHE_DIST_DIR:process.env.GUICHE_DIST_DIR||(mode==='dev'?'.next':'.next-local'),NEXT_TELEMETRY_DISABLED:'1'}
});
child.on('error',error=>{console.error(error.message);process.exitCode=1});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
