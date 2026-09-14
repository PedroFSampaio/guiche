import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:5174';
const measurements=[],checks=[];
const now=performance.now();
function check(name){checks.push(name);console.log('OK:',name)}
async function request(path,body,cookie='',allowed=[200]){
 const started=performance.now();
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const raw=await r.arrayBuffer();
 measurements.push({ms:performance.now()-started,status:r.status,path});
 assert.ok(allowed.includes(r.status),path+' returned '+r.status+': '+Buffer.from(raw).toString().slice(0,240));
 const json=r.headers.get('content-type')?.includes('json')?JSON.parse(Buffer.from(raw).toString()):null;
 return {status:r.status,json,raw,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
function client(cookie){return {cookie,queue:body=>request('/api/queue',body,cookie),auth:body=>request('/api/auth',body,cookie)}}
const anonymous=await request('/api/queue',undefined,'',[401]);assert.equal(anonymous.json.login,true);check('Sem login não acessa pacientes');
const root=await request('/api/auth',{action:'bootstrap',username:'review-admin',password:'ReviewAdmin-2026!'});
const admin=client(root.cookie);
const defs=[...Array.from({length:12},(_,i)=>({username:'review-op'+i,name:'Operador '+i,role:['AC','RM','ED'][i%3],location:'Guichê '+i,password:'ReviewOperator-2026!'})),...Array.from({length:3},(_,i)=>({username:'review-rec'+i,name:'Recepção '+i,role:'reception',location:'',password:'ReviewReception-2026!'})),{username:'review-tv',name:'TV de teste',role:'tv',location:'',password:'ReviewTelevision-2026!'}];
await Promise.all(defs.map(d=>admin.auth({action:'member',...d})));
const users=await Promise.all(defs.map(async d=>({...client((await request('/api/auth',{action:'login',username:d.username,password:d.password})).cookie),...d})));
const operators=users.slice(0,12),reception=users.slice(12,15),tv=users[15];
check('17 sessões autenticadas: administrador, 12 atendentes, 3 recepções e TV');
const pending=await request('/api/queue',undefined,tv.cookie,[401]);assert.equal(pending.json.tvPending,true);
let tvSessions=(await reception[0].auth(undefined)).json.televisions;
await reception[0].auth({action:'approveTV',id:tvSessions[0].id});
assert.equal((await tv.queue()).json.me.role,'tv');check('TV exige aprovação da recepção');
const registrations=[];
for(let batch=0;batch<10;batch++){
 const result=await Promise.all(Array.from({length:12},(_,i)=>reception[i%3].queue({action:'create',name:'Paciente de teste '+(batch*12+i),service:['AC','RM','ED'][i%3],priority:i===0})));
 registrations.push(...result.map(r=>r.json.result));
}
assert.equal(new Set(registrations.map(p=>p.code)).size,120);check('120 chegadas em lotes de 12, sem senhas duplicadas');
const callOwners=new Map();
for(let round=0;round<3;round++){
 const called=await Promise.all(operators.map(async op=>({op,response:await op.queue({action:'call',acknowledge:true})})));
 for(const {op,response} of called){const id=response.json.result.id;assert.ok(!callOwners.has(id),'Paciente chamado duas vezes');callOwners.set(id,op);}
}
check('36 chamadas concorrentes em três setores, sem dupla atribuição');
for(let round=0;round<10;round++){
 const results=await Promise.all(operators.map(op=>op.queue()));
 for(let i=0;i<results.length;i++){
  const payload=results[i].json;
  assert.ok(payload.patients.every(p=>p.service===operators[i].role));
  assert.equal(payload.members,undefined);
 }
}
check('120 consultas concorrentes respeitam o setor de cada atendente');
await request('/api/queue',{action:'call'},reception[0].cookie,[400]);
await request('/api/queue',{action:'create',name:'Não permitido',service:'AC'},tv.cookie,[400]);
await request('/api/auth',{action:'tvAudio',setting:'voice',enabled:true},operators[0].cookie,[400]);
check('Servidor bloqueia ações de perfis não autorizados');
const claims=await Promise.all([tv.queue({action:'claimAnnouncement',lease:'review-one'}),tv.queue({action:'claimAnnouncement',lease:'review-two'})]);
assert.equal(claims.filter(r=>r.json.result).length,1);
const announcement=claims.find(r=>r.json.result).json.result;
await request('/api/queue',{action:'finishAnnouncement',id:announcement.id,lease:announcement.lease},tv.cookie,[400]);
await new Promise(r=>setTimeout(r,7100));
await tv.queue({action:'finishAnnouncement',id:announcement.id,lease:announcement.lease});
const owner=callOwners.get(announcement.patientId);assert.ok(owner);
await owner.queue({action:'start',id:announcement.patientId});
await owner.queue({action:'finish',id:announcement.patientId});
check('Anúncio único, bloqueio antes de 7 segundos e início/conclusão pelo responsável');
const day=(await admin.queue()).json.day;
const exported=await request('/api/queue?export=xlsx&day='+day,undefined,owner.cookie);
assert.equal(Buffer.from(exported.raw).toString('ascii',0,2),'PK');
await request('/api/queue?export=xlsx&day='+day,undefined,tv.cookie,[400]);
await request('/api/queue?export=xlsx&day='+day,undefined,'',[401]);
const otherSector=(await operators.find(o=>o.role!==owner.role).queue()).json;
assert.ok(!otherSector.patients.some(p=>p.id===announcement.patientId));check('Excel autenticado e histórico isolado por setor');
await reception[0].auth({action:'tvAudio',setting:'voice',enabled:true});
await reception[0].auth({action:'tvAudio',setting:'chime',enabled:true});
const sound=(await tv.auth()).json.audio;assert.equal(sound.voice,true);assert.equal(sound.chime,true);check('Controles independentes de voz e aviso disponíveis para TV');
await reception[0].auth({action:'disconnectTV',id:tvSessions[0].id});
await request('/api/queue',undefined,tv.cookie,[401]);check('Desconexão remota invalida a sessão da TV');
const all=(await admin.queue()).json;
const old=all.members.find(m=>m.username==='review-rec2');
await admin.auth({action:'member',id:old.email,name:old.name,username:'review-rec-renamed',password:'ReviewNewPassword-2026!',role:'reception',location:''});
await request('/api/queue',undefined,reception[2].cookie,[401]);
await request('/api/auth',{action:'login',username:'review-rec2',password:'ReviewReception-2026!'},'',[400]);
const renewed=await request('/api/auth',{action:'login',username:'review-rec-renamed',password:'ReviewNewPassword-2026!'});
await admin.auth({action:'deleteMember',id:old.email});
await request('/api/queue',undefined,renewed.cookie,[401]);check('Troca de credenciais e exclusão revogam sessões antigas');
const final=(await admin.queue()).json;
assert.equal(final.patients.length,120);
assert.equal(final.patients.filter(p=>p.status==='done').length,1);
writeFileSync('.local-tools/review-state.json',JSON.stringify({patients:final.patients.length,done:1,day}));
const successful=measurements.filter(m=>m.status===200).map(m=>m.ms).sort((a,b)=>a-b);
const report={date:new Date().toISOString(),environment:'Next.js production; SQLite isolated; localhost',sessions:17,simultaneousOperators:12,registrations:120,concurrentCalls:36,checks,requests:measurements.length,successful:successful.length,expectedRejections:measurements.filter(m=>m.status!==200).length,latencyMs:{median:Math.round(successful[Math.floor(successful.length*.5)]),p95:Math.round(successful[Math.floor(successful.length*.95)]),max:Math.round(successful.at(-1))},elapsedSeconds:Math.round((performance.now()-now)/1000)};
writeFileSync('outputs/revisao/integracao.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
