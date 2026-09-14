import {readdirSync,mkdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
mkdirSync('outputs/revisao',{recursive:true});mkdirSync('.local-tools',{recursive:true});
let failed=0,output='';
for(const file of readdirSync('tests').filter(f=>f.endsWith('.test.ts')).sort()){
 const env={...process.env,GUICHE_BUILD:'0',GUICHE_DATA_DIR:mkdtempSync(path.join(tmpdir(),'guiche-suite-'))};delete env.GUICHE_PUBLIC_ORIGIN;
 const result=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-isolation=none',path.join('tests',file)],{encoding:'utf8',env});
 const text=file+'\n'+(result.stdout||'')+(result.stderr||'');process.stdout.write(text);output+=text+'\n';
 if(result.error||result.status!==0)failed++;
}
writeFileSync('outputs/revisao/testes-unitarios.txt',output);
if(failed){console.error(failed+' arquivo(s) de testes falharam.');process.exitCode=1;}
