import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,mutate,dayKey,spokenName,type Service,type Member} from '../lib/queue.ts';
const reception:Member={email:'r@unit.test',name:'Recepção',role:'reception',location:''};
const ac:Member={email:'ac@unit.test',name:'Responsável A',role:'AC',location:'Guichê 1'};
const ac2:Member={...ac,email:'ac2@unit.test'};
const rm:Member={...ac,email:'rm@unit.test',role:'RM'};
const tv:Member={...ac,email:'tv@unit.test',role:'tv'};
const now=Date.parse('2026-09-27T12:00:00Z');
function create(s:any,name='Maria Aparecida da Silva',service:Service='AC',at=now,extra={}){return mutate(s,reception,{action:'create',name,service,...extra},at) as any}
function call(s:any,m=ac,at=now){return mutate(s,m,{action:'call',acknowledge:true},at) as any}
test('voz usa primeiro e último nomes',()=>{assert.equal(spokenName(' Maria Aparecida da Silva '),'Maria Silva');assert.equal(spokenName('Ana'),'Ana')});
test('numeração reinicia por atividade e data, mantendo histórico',()=>{const s=emptyState();create(s);create(s,'João','RM');create(s,'Pedro');create(s,'Ana','AC',now+86400000);assert.deepEqual(s.patients.map(p=>p.code),['AC-001','RM-001','AC-002','AC-001']);assert.equal(s.patients.length,4)});
test('data usa horário de São Paulo',()=>assert.equal(dayKey(Date.parse('2026-09-28T01:00:00Z')),'2026-09-27'));
test('prioridade precede ordem de chegada',()=>{const s=emptyState();create(s,'Normal');create(s,'Prioritário','AC',now+10,{priority:true});call(s);assert.equal(s.patients.find(p=>p.status==='calling')!.name,'Prioritário')});
test('cada setor só chama e altera sua fila',()=>{const s=emptyState();const p=create(s);assert.throws(()=>call(s,rm),/Nenhum paciente/);assert.throws(()=>mutate(s,rm,{action:'cancelled',id:p.id},now),/acesso/);assert.throws(()=>mutate(s,tv,{action:'create',name:'Ana',service:'AC'},now),/recepção/)});
test('mesmo paciente não é chamado duas vezes por operadores',()=>{const s=emptyState();create(s);call(s);assert.throws(()=>call(s,ac2),/Nenhum paciente/)});
test('encerra após três distintos do mesmo responsável; rechamadas e outro responsável não contam',()=>{const s=emptyState();const first=create(s);for(let i=0;i<5;i++)create(s,'Paciente '+i);call(s);call(s,ac2);assert.equal(s.patients[0].subsequent.length,0);const a=mutate(s,tv,{action:'claimAnnouncement',lease:'tv'},now) as any;mutate(s,tv,{action:'finishAnnouncement',id:a.id,lease:'tv'},now+7000);mutate(s,ac,{action:'recall',id:first.id},now+8000);assert.equal(s.patients[0].subsequent.length,0);call(s,ac,now+9000);call(s,ac,now+10000);assert.equal(s.patients[0].status,'calling');call(s,ac,now+11000);assert.equal(s.patients[0].status,'automatic');assert.equal(s.patients[0].subsequent.length,3)});
test('pendência exige ciência explícita',()=>{const s=emptyState();create(s);create(s,'Ana');call(s);assert.throws(()=>mutate(s,ac,{action:'call'},now),/pendente/)});
test('TV serializa anúncios e exige sete segundos',()=>{const s=emptyState();create(s);create(s,'Ana','RM');call(s);call(s,rm);const a=mutate(s,tv,{action:'claimAnnouncement',lease:'one'},now) as any;assert.equal(mutate(s,tv,{action:'claimAnnouncement',lease:'two'},now+100),null);assert.throws(()=>mutate(s,tv,{action:'finishAnnouncement',id:a.id,lease:'one'},now+6999),/7 segundos/);mutate(s,tv,{action:'finishAnnouncement',id:a.id,lease:'one'},now+7000);const b=mutate(s,tv,{action:'claimAnnouncement',lease:'one'},now+7100) as any;assert.notEqual(a.id,b.id)});
test('transferência mantém um registro somente na fila final',()=>{const s=emptyState();const p=create(s);mutate(s,reception,{action:'transfer',id:p.id,service:'ED'},now);assert.equal(s.patients.length,1);assert.equal(s.patients[0].service,'ED');assert.equal(s.patients[0].code,'ED-001');assert.match(s.patients[0].events[1].text,/AC-001/)});
test('ausência só após anúncio; retorno preserva senha',()=>{const s=emptyState();const p=create(s);call(s);assert.throws(()=>mutate(s,ac,{action:'absent',id:p.id},now),/anúncio/);mutate(s,tv,{action:'claimAnnouncement',lease:'one'},now);mutate(s,ac,{action:'absent',id:p.id},now+100);mutate(s,ac,{action:'return',id:p.id},now+200);assert.equal(s.patients[0].code,'AC-001');assert.equal(s.patients[0].status,'waiting')});
test('múltiplas atividades são sequenciais',()=>{const s=emptyState();const p=create(s,'Maria','AC',now,{next:['ED']});call(s);mutate(s,tv,{action:'claimAnnouncement',lease:'one'},now);mutate(s,ac,{action:'start',id:p.id},now+8000);mutate(s,ac,{action:'finish',id:p.id},now+9000);assert.equal(s.patients[0].service,'ED');assert.equal(s.patients[0].status,'waiting');assert.equal(s.patients.length,1)});

test('chamada visual desbloqueia início e conclusão do atendimento',()=>{
 const s=emptyState();const patient=create(s);
 call(s);
 assert.equal(s.patients[0].status,'calling');
 assert.throws(()=>mutate(s,ac,{action:'start',id:patient.id},now+1),/anúncio/);
 // The TV claims visual announcements even if speech has not been enabled.
 const announcement=mutate(s,tv,{action:'claimAnnouncement',lease:'visual'},now+100) as any;
 assert.equal(announcement.name,'Maria Aparecida da Silva');
 assert.ok(s.patients[0].announced);
 mutate(s,ac,{action:'start',id:patient.id},now+200);
 assert.equal(s.patients[0].status,'serving');
 mutate(s,ac,{action:'finish',id:patient.id},now+300);
 assert.equal(s.patients[0].status,'done');
 mutate(s,tv,{action:'finishAnnouncement',id:announcement.id,lease:'visual'},now+7200);
 assert.ok(s.announcements[0].ended);
});
