import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const folder=path.resolve(process.env.GUICHE_DATA_DIR||'.local-data');
const targetDir=path.resolve(process.env.GUICHE_BACKUP_DIR||path.join(folder,'backups'));
mkdirSync(targetDir,{recursive:true});
const target=path.join(targetDir,'guiche-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const database=new DatabaseSync(path.join(folder,'guiche.sqlite'),{readOnly:true});
try{await backup(database,target);console.log('Backup consistente salvo em '+target);}finally{database.close();}
