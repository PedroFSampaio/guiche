import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Member } from '../lib/queue.ts';
process.env.GUICHE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'guiche-chat-test-'));
const { sqlite } = await import('../lib/local-env.ts');
const { chatSnapshot, sendChat, readChat } = await import('../lib/chat.ts');
const a: Member = { email:'a', name:'Ana', role:'reception', location:'' };
const b: Member = { email:'b', name:'Bruno', role:'AC', location:'' };
const c: Member = { email:'c', name:'Carla', role:'admin', location:'' };
const tv: Member = { email:'tv', name:'TV', role:'tv', location:'' };
const reserve: Member = { email:'admin@guiche.local', name:'Sampaio', role:'admin', location:'' };
function seed(people = [a,b,c,tv,reserve]) { sqlite.exec('DELETE FROM chat_messages; DELETE FROM chat_reads'); sqlite.prepare("INSERT INTO unit_state(id,data) VALUES('unit',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify({members:people})); }
test('geral para equipe e privados somente para os participantes, inclusive contra administrador', () => {
 seed(); sendChat(a,'general','Bom dia',randomUUID()); sendChat(a,b.email,'Mensagem privada',randomUUID());
 assert.equal(chatSnapshot(b).messages[0].body,'Bom dia');
 assert.equal(chatSnapshot(b,a.email).messages[0].body,'Mensagem privada');
 assert.equal(chatSnapshot(a,b.email).messages.length,1);
 assert.equal(chatSnapshot(c,b.email).messages.length,0);
 assert.equal(chatSnapshot(c,a.email).messages.length,0);
 assert.equal(chatSnapshot(c).latest?.body,'Bom dia');
 assert.deepEqual(chatSnapshot(a).contacts.map(x=>x.id).sort(),['b','c']);
 assert.throws(()=>chatSnapshot(tv)); assert.throws(()=>chatSnapshot(reserve));
 assert.throws(()=>sendChat(a,tv.email,'Não',randomUUID()));
 assert.throws(()=>sendChat(a,reserve.email,'Não',randomUUID()));
});
test('leitura por conversa não apaga mensagens novas nem as de outro usuário', () => {
 seed(); sendChat(a,b.email,'Uma',randomUUID()); const first=chatSnapshot(b,a.email).messages[0];
 sendChat(a,b.email,'Duas',randomUUID()); sendChat(c,'general','Aviso',randomUUID());
 readChat(b,a.email,first.id);
 assert.equal(chatSnapshot(b).unread.a,1); assert.equal(chatSnapshot(b).unread.general,1);
 readChat(c,a.email,999999); assert.equal(chatSnapshot(b).unread.a,1);
 readChat(b,a.email,0); assert.equal(chatSnapshot(b).unread.a,1);
 assert.equal(chatSnapshot(a,b.email).unread.b,undefined);
});
test('reenvio após falha não duplica, histórico paginado não perde mensagens', () => {
 seed(); const id=randomUUID(); sendChat(a,b.email,'Uma',id); sendChat(a,b.email,'Uma',id);
 for(let i=0;i<105;i++) sendChat(a,b.email,'Mensagem '+i,randomUUID());
 const page=chatSnapshot(b,a.email); assert.equal(page.messages.length,100); assert.equal(page.hasOlder,true);
 const older=chatSnapshot(b,a.email,page.messages[0].id); assert.equal(older.messages.length,6); assert.equal(older.hasOlder,false);
 assert.equal(new Set([...page.messages,...older.messages].map(m=>m.id)).size,106);
});
test('contato removido mantém histórico privado e não pode receber novas mensagens', () => {
 seed(); sendChat(b,a.email,'Histórico',randomUUID());
 sqlite.prepare("UPDATE unit_state SET data=? WHERE id='unit'").run(JSON.stringify({members:[a,c,tv,reserve]}));
 assert.equal(chatSnapshot(a,b.email).messages[0].body,'Histórico');
 assert.equal(chatSnapshot(a).contacts.find(x=>x.id==='b')?.active,false);
 assert.throws(()=>sendChat(a,b.email,'Nova',randomUUID())); assert.throws(()=>chatSnapshot(b));
 assert.throws(()=>sendChat(a,'general','  ',randomUUID()));
 assert.throws(()=>sendChat(a,'general','x'.repeat(2001),randomUUID()));
});
