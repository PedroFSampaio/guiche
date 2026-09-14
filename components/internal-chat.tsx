"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Users } from 'lucide-react';
import type { ChatMessage, ChatSnapshot } from '../lib/chat';

async function request<T>(path = '', body?: unknown): Promise<T> {
 const response = await fetch('/api/chat' + path, { cache: 'no-store', signal: AbortSignal.timeout(10000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
 const data = await response.json() as T & { error?: string };
 if (!response.ok) throw Error(data.error || 'Não foi possível conectar ao chat.');
 return data as T;
}
const conversationOf = (message: ChatMessage) => message.recipient === 'general' ? 'general' : message.sender;
const timestamp = (value: number) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function InternalChat({ memberId }: { memberId: string }) {
 const [open, setOpen] = useState(false), [conversation, setConversation] = useState('general');
 const [data, setData] = useState<ChatSnapshot | null>(null), [messages, setMessages] = useState<ChatMessage[]>([]);
 const [drafts, setDrafts] = useState<Record<string, string>>({}), [error, setError] = useState('');
 const [sending, setSending] = useState(false), [loadingOlder, setLoadingOlder] = useState(false), [hasOlder, setHasOlder] = useState(false);
 const [toast, setToast] = useState<ChatMessage | null>(null);
 const current = useRef(conversation), opened = useRef(open), notified = useRef(0), olderLoaded = useRef(false), sequence = useRef(0);
 const bottom = useRef<HTMLDivElement>(null), scrollToBottom = useRef(false);
 const retry = useRef<{ conversation: string; body: string; clientId: string } | null>(null);
 const fetching = useRef(false);

 const refresh = useCallback(async () => {
  if (fetching.current) return;
  fetching.current = true;
  const target = current.current, version = sequence.current;
  try {
   const snapshot = await request<ChatSnapshot>('?conversation=' + encodeURIComponent(target));
   if (version !== sequence.current || target !== current.current) return;
   setData(snapshot); setError('');
   setMessages(previous => {
    if (previous.at(-1)?.id !== snapshot.messages.at(-1)?.id) scrollToBottom.current = true;
    return olderLoaded.current ? [...new Map([...previous, ...snapshot.messages].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id) : snapshot.messages;
   });
   if (!olderLoaded.current) setHasOlder(snapshot.hasOlder);
   const latest = snapshot.latest;
   if (latest && latest.id > notified.current) {
    notified.current = latest.id;
    if (!opened.current || document.visibilityState !== 'visible' || conversationOf(latest) !== target) setToast(latest);
   }
   const last = snapshot.messages.at(-1);
   if (opened.current && document.visibilityState === 'visible' && last && snapshot.unread[target]) {
    await request('', { action: 'read', conversation: target, through: last.id });
    if (version === sequence.current) setData(d => d ? { ...d, unread: { ...d.unread, [target]: 0 } } : d);
   }
  } catch (e) { if (version === sequence.current) setError((e as Error).message); }
  finally { fetching.current = false; }
 }, []);
 useEffect(() => { const lifecycle = sequence; const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 2000); const visible = () => { if (document.visibilityState === 'visible') void refresh(); }; document.addEventListener('visibilitychange', visible); return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener('visibilitychange', visible); lifecycle.current++; }; }, [refresh]);
 useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 8000); return () => clearTimeout(timer); }, [toast]);
 useEffect(() => { if (open && scrollToBottom.current) { bottom.current?.scrollIntoView({ block: 'nearest' }); scrollToBottom.current = false; } }, [messages, open]);
 function select(target: string) {
  if (target !== current.current) { sequence.current++; current.current = target; olderLoaded.current = false; setMessages([]); setHasOlder(false); setConversation(target); }
  opened.current = true; setOpen(true); setToast(null); scrollToBottom.current = true; void refresh();
 }
 async function older() {
  const first = messages[0], target = current.current, version = sequence.current;
  if (!first) return;
  setLoadingOlder(true);
  try { const result = await request<ChatSnapshot>('?conversation=' + encodeURIComponent(target) + '&before=' + first.id); if (version !== sequence.current) return; olderLoaded.current = true; setMessages(previous => [...new Map([...result.messages, ...previous].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id)); setHasOlder(result.hasOlder); }
  catch (e) { setError((e as Error).message); } finally { setLoadingOlder(false); }
 }
 async function send() {
  const body = (drafts[conversation] || '').trim(), target = conversation;
  if (!body || sending) return;
  setSending(true);
  if (retry.current?.body !== body || retry.current?.conversation !== target) retry.current = { body, conversation: target, clientId: crypto.randomUUID() };
  try { await request('', { action: 'send', recipient: target, body, clientId: retry.current.clientId }); retry.current = null; setDrafts(d => ({ ...d, [target]: '' })); scrollToBottom.current = true; await refresh(); }
  catch (e) { setError((e as Error).message); } finally { setSending(false); }
 }
 const total = Object.values(data?.unread || {}).reduce((sum, n) => sum + n, 0);
 const contact = data?.contacts.find(c => c.id === conversation);
 const title = conversation === 'general' ? 'Conversa geral' : contact?.name || 'Conversa privada';
 return <div className="internal-chat">
  {toast && <div className="chat-toast" role="status"><button className="chat-toast-link" onClick={() => select(conversationOf(toast))}><MessageCircle size={22}/><span><strong>Nova mensagem de {toast.sender_name}</strong><small>{toast.recipient === 'general' ? 'Conversa geral' : 'Conversa privada'} · Clique para abrir</small></span></button><button className="chat-icon-button" aria-label="Dispensar aviso" onClick={() => setToast(null)}><X size={18}/></button></div>}
  {open && <section className="chat-panel" aria-label="Chat interno">
   <div className="chat-heading"><div><strong>Chat da equipe</strong><small>Geral e privado · sem notificações sonoras</small></div><button className="chat-icon-button" aria-label="Fechar chat" onClick={() => { opened.current = false; setOpen(false); }}><X/></button></div>
   <div className="chat-body"><nav className="chat-contacts" aria-label="Conversas"><button className={conversation === 'general' ? 'selected' : ''} onClick={() => select('general')}><Users size={18}/><span>Geral</span>{!!data?.unread.general && <b>{data.unread.general}</b>}</button>{data?.contacts.map(c => <button key={c.id} className={conversation === c.id ? 'selected' : ''} onClick={() => select(c.id)}><span>{c.name}{!c.active && <small>Acesso removido</small>}</span>{!!data.unread[c.id] && <b>{data.unread[c.id]}</b>}</button>)}</nav>
   <div className="chat-conversation"><h2>{title}</h2><div className="chat-messages" aria-label="Mensagens">{hasOlder && <button className="chat-older" disabled={loadingOlder} onClick={() => void older()}>{loadingOlder ? 'Carregando…' : 'Carregar anteriores'}</button>}{!messages.length && <p className="chat-empty">Nenhuma mensagem nesta conversa.</p>}{messages.map(m => <article key={m.id} className={'chat-message' + (m.sender === memberId ? ' own' : '')}><strong>{m.sender === memberId ? 'Você' : m.sender_name}</strong><p>{m.body}</p><time>{timestamp(m.created)}</time></article>)}<div ref={bottom}/></div>
   {error && <div className="chat-error" role="alert">{error} As mensagens não enviadas permanecem no campo.</div>}
   <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(); }}><textarea aria-label="Mensagem" placeholder={contact?.active === false ? 'Este acesso foi removido' : 'Escreva uma mensagem…'} maxLength={2000} value={drafts[conversation] || ''} disabled={sending || contact?.active === false} onChange={e => setDrafts(d => ({ ...d, [conversation]: e.target.value }))}/><button aria-label="Enviar mensagem" disabled={sending || !(drafts[conversation] || '').trim() || contact?.active === false}><Send size={20}/></button></form></div></div>
  </section>}
  <button className="chat-launcher" aria-expanded={open} onClick={() => { if (open) { opened.current = false; setOpen(false); } else select(conversation); }}><MessageCircle size={22}/> Chat da equipe {total > 0 && <b>{total > 99 ? '99+' : total}</b>}</button>
 </div>;
}
