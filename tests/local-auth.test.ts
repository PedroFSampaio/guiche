import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.GUICHE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'guiche-auth-test-'));
const auth = await import('../lib/local-auth.ts');
const { sqlite } = await import('../lib/local-env.ts');
const cookie = (token: string) => auth.COOKIE + '=' + token;
test('primeiro administrador, login e preservação dos cadastros existentes', () => {
  sqlite.prepare('INSERT INTO unit_state (id,data) VALUES (?,?)').run('unit',JSON.stringify({members:[{email:'old-admin',name:'Admin',role:'admin',location:''},{email:'old-person',name:'Pedro',role:'reception',location:''}],counters:{today:2}}));
  assert.equal(auth.needsBootstrap(), true);
  const token = auth.bootstrap({username:'Admin',password:'SenhaInicial123'});
  assert.equal(auth.sessionMember(cookie(token))?.email, 'old-admin');
  assert.equal(auth.needsBootstrap(), false);
  assert.throws(() => auth.bootstrap({username:'outro',password:'SenhaInicial123'}));
  assert.equal(JSON.parse(String(sqlite.prepare("SELECT data FROM unit_state WHERE id='unit'").get()!.data)).counters.today,2);
  auth.logout(cookie(token));
  assert.equal(auth.sessionMember(cookie(token)),null);
  assert.throws(() => auth.login('admin','errada'));
});
test('admin cadastra, altera usuário/senha e invalida sessões mantendo identidade', () => {
  const admin = auth.sessionMember(cookie(auth.login('admin','SenhaInicial123')))!;
  auth.saveMember(admin,{id:'old-person',name:'Pedro',username:'pedro',password:'SenhaPedro123',role:'reception',location:''});
  const oldToken = auth.login('pedro','SenhaPedro123');
  const person = auth.sessionMember(cookie(oldToken))!;
  assert.equal(person.email,'old-person');
  assert.throws(() => auth.saveMember(person,{username:'outro',password:'SenhaTeste123',name:'Outro',role:'admin'}),/restrito/);
  auth.saveMember(admin,{id:'old-person',name:'Pedro',username:'pedro2',password:'NovaSenha123',role:'AC',location:'Guichê 2'});
  assert.equal(auth.sessionMember(cookie(oldToken)),null);
  assert.throws(() => auth.login('pedro','SenhaPedro123'));
  assert.throws(() => auth.login('pedro2','SenhaPedro123'));
  assert.equal(auth.sessionMember(cookie(auth.login('pedro2','NovaSenha123')))?.role,'AC');
  assert.throws(() => auth.saveMember(admin,{name:'Duplicado',username:'pedro2',password:'NovaSenha123',role:'tv',location:''}),/já está em uso/);
  assert.throws(() => auth.saveMember(admin,{id:admin.email,name:'Admin',username:'admin',role:'tv',location:''}),/próprio acesso/);
  auth.saveMember(admin,{id:'old-person',name:'Pedro',username:'pedro3',password:'',role:'tv',location:''});
  assert.equal(auth.sessionMember(cookie(auth.login('pedro3','NovaSenha123')),true)?.email,'old-person');
  const hash = String(sqlite.prepare('SELECT hash FROM credentials WHERE username=?').get('pedro3')!.hash);
  assert.ok(!hash.includes('NovaSenha123'));
});
test('sessão expirada e bloqueio de tentativas de senha', () => {
  const token = auth.login('pedro3','NovaSenha123');
  sqlite.prepare('UPDATE sessions SET expires=0').run();
  assert.equal(auth.sessionMember(cookie(token)),null);
  for(let i=0;i<5;i++) assert.throws(() => auth.login('pedro3','errada'));
  assert.throws(() => auth.login('pedro3','NovaSenha123'),/Muitas tentativas/);
});

test('TV precisa de liberação e somente admin ou recepção controla a sessão', () => {
  const admin=auth.sessionMember(cookie(auth.login('admin','SenhaInicial123')))!;
  auth.saveMember(admin,{name:'Televisão',username:'painel',password:'SenhaPainel123',role:'tv',location:''});
  auth.saveMember(admin,{name:'Recepção',username:'recepcao',password:'SenhaRecepcao123',role:'reception',location:''});
  const reception=auth.sessionMember(cookie(auth.login('recepcao','SenhaRecepcao123')))!;
  const token=auth.login('painel','SenhaPainel123');
  assert.equal(auth.sessionMember(cookie(token)),null);
  const pending=auth.sessionMember(cookie(token),true)!;
  assert.equal(pending.role,'tv');
  assert.throws(()=>auth.televisionSessions(pending),/restrito/);
  assert.throws(()=>auth.logout(cookie(token)),/desconectar/);
  const connection=auth.televisionSessions(reception).find(s=>s.username==='painel')!;
  assert.equal(connection.approved,false);
  assert.throws(()=>auth.controlTelevision({...reception,role:'AC'},String(connection.id),'approveTV'),/restrito/);
  auth.controlTelevision(reception,String(connection.id),'approveTV');
  assert.equal(auth.sessionMember(cookie(token))?.role,'tv');
  auth.controlTelevision(admin,String(connection.id),'disconnectTV');
  assert.equal(auth.sessionMember(cookie(token)),null);
  assert.equal(auth.sessionMember(cookie(token),true),null);
  const next=auth.login('painel','SenhaPainel123');
  assert.equal(auth.sessionMember(cookie(next)),null);
  assert.equal(auth.sessionMember(cookie(next),true)?.role,'tv');
});

test('recepção controla voz e aviso separadamente, com confirmação apenas ao ativar',()=>{
 const reception={email:'r',name:'Recepção',role:'reception' as const,location:''};
 assert.deepEqual(auth.televisionAudio(),{voice:false,chime:false,confirmation:0});
 auth.setTelevisionAudio(reception,'voice',true);
 assert.deepEqual(auth.televisionAudio(),{voice:true,chime:false,confirmation:1});
 auth.setTelevisionAudio(reception,'voice',true);
 assert.equal(auth.televisionAudio().confirmation,1);
 auth.setTelevisionAudio(reception,'chime',true);
 assert.deepEqual(auth.televisionAudio(),{voice:true,chime:true,confirmation:2});
 auth.setTelevisionAudio(reception,'voice',false);
 assert.deepEqual(auth.televisionAudio(),{voice:false,chime:true,confirmation:2});
 assert.throws(()=>auth.setTelevisionAudio({...reception,role:'tv'},'voice',true),/restrito/);
 assert.throws(()=>auth.setTelevisionAudio({...reception,role:'AC'},'chime',false),/restrito/);
 assert.throws(()=>auth.setTelevisionAudio(reception,'invalid',true),/inválida/);
 assert.throws(()=>auth.setTelevisionAudio(reception,'voice','yes'),/inválida/);
});

test('exclusão revoga login e sessões, preserva histórico e impede excluir a si mesmo',()=>{
 const admin=auth.sessionMember(cookie(auth.login('admin','SenhaInicial123')))!;
 auth.saveMember(admin,{name:'Acesso antigo',username:'antigo',password:'SenhaAntiga123',role:'AC',location:'Guichê 3'});
 const token=auth.login('antigo','SenhaAntiga123'),member=auth.sessionMember(cookie(token))!;
 const patient={owner:member.email,status:'serving',name:'Paciente teste',events:[{text:'Atendido por Acesso antigo'}]};
 sqlite.prepare('INSERT INTO unit_state (id,data) VALUES (?,?)').run('p:delete-test',JSON.stringify(patient));
 assert.throws(()=>auth.deleteMember(member,admin.email),/restrito/);
 assert.throws(()=>auth.deleteMember(admin,admin.email),/próprio/);
 assert.throws(()=>auth.deleteMember(admin,member.email),/pendentes/);
 assert.ok(auth.sessionMember(cookie(token)));
 patient.status='done';
 const saved=JSON.stringify(patient);
 sqlite.prepare('UPDATE unit_state SET data=? WHERE id=?').run(saved,'p:delete-test');
 auth.deleteMember(admin,member.email);
 assert.equal(auth.sessionMember(cookie(token)),null);
 assert.throws(()=>auth.login('antigo','SenhaAntiga123'));
 assert.equal(sqlite.prepare('SELECT data FROM unit_state WHERE id=?').get('p:delete-test')!.data,saved);
 assert.throws(()=>auth.deleteMember(admin,member.email),/não encontrado/);
 assert.ok(auth.sessionMember(cookie(auth.login('admin','SenhaInicial123'))));
});

test('conta original de reserva fica oculta e protegida contra outros administradores',async()=>{
 const {RESERVE_ADMIN_ID}=await import('../lib/reserve-admin.ts');
 const {visibleQueue}=await import('../lib/visible-queue.ts');
 const admin=auth.sessionMember(cookie(auth.login('admin','SenhaInicial123')))!;
 const root=sqlite.prepare("SELECT data FROM unit_state WHERE id='unit'").get()!;
 const meta=JSON.parse(String(root.data));
 const reserve={email:RESERVE_ADMIN_ID,name:'Administrador local',username:'sampaio',role:'admin',location:''};
 meta.members.push(reserve);
 sqlite.prepare("UPDATE unit_state SET data=? WHERE id='unit'").run(JSON.stringify(meta));
 const before=String(sqlite.prepare("SELECT data FROM unit_state WHERE id='unit'").get()!.data);
 assert.throws(()=>auth.deleteMember(admin,RESERVE_ADMIN_ID),/reserva.*protegida/);
 for(const changes of [{username:'renomeado'},{password:'NovaSenha123'},{role:'tv'}] as const){
  assert.throws(()=>auth.saveMember(admin,{id:RESERVE_ADMIN_ID,name:reserve.name,username:'sampaio',role:'admin',location:'',...changes}),/reserva.*protegida/);
 }
 assert.equal(String(sqlite.prepare("SELECT data FROM unit_state WHERE id='unit'").get()!.data),before);
 const state={members:meta.members,patients:[],announcements:[],counters:{}};
 assert.ok(!visibleQueue(state,admin,null).members!.some(m=>m.email===RESERVE_ADMIN_ID));
 assert.ok(!visibleQueue(state,reserve as any,null).members!.some(m=>m.email===RESERVE_ADMIN_ID));
 assert.equal(visibleQueue(state,reserve as any,null).me.role,'admin');
});


test('mudança de função não deixa um atendimento pendente sem responsável acessível',()=>{
 const admin=auth.sessionMember(cookie(auth.login('admin','SenhaInicial123')))!;
 auth.saveMember(admin,{name:'Responsável',username:'rolechange',password:'ReviewPassword123',role:'AC',location:'1'});
 const token=auth.login('rolechange','ReviewPassword123'),member=auth.sessionMember(cookie(token))!;
 sqlite.prepare('INSERT INTO unit_state (id,data) VALUES (?,?)').run('p:role-change',JSON.stringify({owner:member.email,status:'serving'}));
 assert.throws(()=>auth.saveMember(admin,{id:member.email,name:member.name,username:'rolechange',role:'RM',location:'2'}),/pendentes/);
 assert.equal(auth.sessionMember(cookie(token))?.role,'AC');
});
