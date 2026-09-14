import { sqlite } from './local-env.ts';
import { isReserveAdmin } from './reserve-admin.ts';
import type { Member } from './queue.ts';

sqlite.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL, sender_name TEXT NOT NULL,
 recipient TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL, client_id TEXT NOT NULL,
 UNIQUE(sender, client_id));
 CREATE INDEX IF NOT EXISTS chat_recipient_id ON chat_messages(recipient,id);
 CREATE INDEX IF NOT EXISTS chat_sender_id ON chat_messages(sender,id);
 CREATE TABLE IF NOT EXISTS chat_reads (member TEXT NOT NULL, conversation TEXT NOT NULL,
 last_id INTEGER NOT NULL, PRIMARY KEY(member,conversation));`);

export type ChatMessage = { id: number; sender: string; sender_name: string; recipient: string; body: string; created: number };
export type ChatContact = { id: string; name: string; active: boolean };
export type ChatSnapshot = { contacts: ChatContact[]; messages: ChatMessage[]; unread: Record<string, number>; latest: ChatMessage | null; hasOlder: boolean };
const columns = 'id,sender,sender_name,recipient,body,created';
export function canChat(member: Member) { return member.role !== 'tv' && !isReserveAdmin(member); }
function members(): Member[] {
 const row = sqlite.prepare("SELECT data FROM unit_state WHERE id='unit'").get();
 return row ? (JSON.parse(String(row.data)).members ?? []) : [];
}
function authorize(actor: Member) {
 if (!canChat(actor) || !members().some(m => m.email === actor.email && canChat(m))) throw Error('Chat indisponível para este acesso.');
}
function clause(actor: Member, conversation: string) {
 return conversation === 'general'
  ? { sql: "recipient='general'", args: [] as string[] }
  : { sql: '(sender=? AND recipient=? OR sender=? AND recipient=?)', args: [actor.email, conversation, conversation, actor.email] };
}
export function chatSnapshot(actor: Member, conversation = 'general', before = 0): ChatSnapshot {
 authorize(actor);
 const contacts: ChatContact[] = members().filter(m => m.email !== actor.email && canChat(m)).map(m => ({ id: m.email, name: m.name, active: true }));
 // Keep an existing private conversation readable after its contact is removed.
 const former = sqlite.prepare(`SELECT DISTINCT sender,recipient,sender_name FROM chat_messages WHERE recipient!='general' AND (sender=? OR recipient=?)`).all(actor.email, actor.email);
 for (const row of former) {
  const id = String(row.sender === actor.email ? row.recipient : row.sender);
  if (!contacts.some(c => c.id === id)) contacts.push({ id, name: row.sender === actor.email ? 'Acesso removido' : String(row.sender_name), active: false });
 }
 const scope = clause(actor, conversation);
 const rows = sqlite.prepare(`SELECT ${columns} FROM chat_messages WHERE ${scope.sql} ${before ? 'AND id<?' : ''} ORDER BY id DESC LIMIT 101`).all(...scope.args, ...(before ? [before] : [])) as ChatMessage[];
 const unreadRows = sqlite.prepare(`SELECT CASE WHEN recipient='general' THEN 'general' ELSE sender END AS conversation, COUNT(*) AS count
 FROM chat_messages m WHERE sender!=? AND (recipient='general' OR recipient=?)
 AND id>COALESCE((SELECT last_id FROM chat_reads r WHERE r.member=? AND r.conversation=CASE WHEN m.recipient='general' THEN 'general' ELSE m.sender END),0)
 GROUP BY conversation`).all(actor.email, actor.email, actor.email);
 const latest = sqlite.prepare(`SELECT ${columns} FROM chat_messages m WHERE sender!=? AND (recipient='general' OR recipient=?)
 AND id>COALESCE((SELECT last_id FROM chat_reads r WHERE r.member=? AND r.conversation=CASE WHEN m.recipient='general' THEN 'general' ELSE m.sender END),0) ORDER BY id DESC LIMIT 1`).get(actor.email, actor.email, actor.email) as ChatMessage | undefined;
 return { contacts, messages: rows.slice(0, 100).reverse(), hasOlder: rows.length > 100, unread: Object.fromEntries(unreadRows.map(r => [String(r.conversation), Number(r.count)])), latest: latest ?? null };
}
export function sendChat(actor: Member, recipient: string, body: string, clientId: string) {
 authorize(actor);
 body = body.trim();
 if (!body || body.length > 2000) throw Error('Escreva uma mensagem de até 2.000 caracteres.');
 if (recipient !== 'general' && !members().some(m => m.email === recipient && m.email !== actor.email && canChat(m))) throw Error('Este contato não está disponível.');
 sqlite.prepare('INSERT INTO chat_messages(sender,sender_name,recipient,body,created,client_id) VALUES(?,?,?,?,?,?) ON CONFLICT(sender,client_id) DO NOTHING').run(actor.email, actor.name, recipient, body, Date.now(), clientId);
}
export function readChat(actor: Member, conversation: string, through: number) {
 authorize(actor);
 const scope = clause(actor, conversation);
 const row = sqlite.prepare(`SELECT MAX(id) AS id FROM chat_messages WHERE ${scope.sql} AND id<=?`).get(...scope.args, through);
 if (row?.id) sqlite.prepare('INSERT INTO chat_reads VALUES(?,?,?) ON CONFLICT(member,conversation) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').run(actor.email, conversation, Number(row.id));
}
