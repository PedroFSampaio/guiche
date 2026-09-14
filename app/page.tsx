"use client";
import { configurePatientVoice } from '../lib/patient-voice';
import { useTelevisionAudio } from '../hooks/use-television-audio';
import { lastDisplayedAnnouncement } from '../lib/displayed-announcement';
import { InternalChat } from '../components/internal-chat';
import { isReserveAdmin } from '../lib/reserve-admin';
import { TelevisionScreen } from '../components/television-screen';
import { Login, Team, signOut, TelevisionControl } from '../components/local-access';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Monitor, History, HeartPulse, ClipboardList, Settings, type LucideIcon } from 'lucide-react';
import { SERVICES, spokenName, isPending, type Service, type Patient, type Member, type Announcement } from '../lib/queue';
type Data = {
    tvPending?: boolean;
    me?: Member;
    day?: string;
    dates?: string[];
    patients?: Patient[];
    announcements?: Announcement[];
    members?: Member[];
};
const status: Record<string, string> = { waiting: 'Aguardando', calling: 'Chamado', serving: 'Em atendimento', done: 'Atendido', absent: 'Ausente', left: 'Foi embora', cancelled: 'Cancelado', automatic: 'Encerrado automaticamente' };
const date = (d: string) => d.split('-').reverse().join('/');
const time = (n?: number) => n ? new Date(n).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
type MutationResult = {
    code?: string;
    id?: string;
    ok?: boolean;
    announcement?: string;
};
async function api<T = MutationResult>(body?: unknown, day = ''): Promise<Data & {
    result: T;
    error?: string;
}> {
    const r = await fetch('/api/queue' + (day ? '?day=' + day : ''), { signal: AbortSignal.timeout(15000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }) });
    const j = await r.json() as Data & {
        result: T;
        error?: string;
    };
    if (r.status === 401) {
        if (body)
            throw Error('Sua sessão terminou. Entre novamente.');
        return j;
    }
    if (!r.ok)
        throw Error(j.error || 'Não foi possível conectar.');
    return j;
}
export default function Home() {
    const [data, setData] = useState<Data>({}), [view, setView] = useState('reception'), [day, setDay] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(true), [service, setService] = useState<Service>('AC'), [location, setLocation] = useState('Guichê 1'), [filter, setFilter] = useState(''), [ack, setAck] = useState(false), [editing, setEditing] = useState<string | null>(null);
    const refreshSequence = useRef(0);
    const initialized = useRef(false);
    const previousRole = useRef('');
    const refresh = useCallback(async () => { const sequence = ++refreshSequence.current; try {
        const j = await api(undefined, view === 'history' ? day : '');
        if (sequence !== refreshSequence.current)
            return;
        setData(j);
        setOnline(true);
        if (!j.me)
            initialized.current = false;
        if (j.me && (!initialized.current || previousRole.current !== j.me.role)) {
            setView((j.me.role === 'tv' || (j.me.role === 'admin' && new URLSearchParams(window.location.search).get('panel') === 'tv')) ? 'tv' : j.me.role in SERVICES ? 'operator' : 'reception');
            if (j.me.role in SERVICES)
                setService(j.me.role as Service);
            initialized.current = true;
            previousRole.current = j.me.role;
        }
        return j;
    }
    catch (e) {
        if (sequence !== refreshSequence.current)
            return;
        setOnline(false);
        setError((e as Error).message);
    } }, [day, view]);
    useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 2000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [refresh]);
    async function exportHistory() { setBusy(true); setError(''); try {
        const r = await fetch('/api/queue?export=xlsx&day=' + encodeURIComponent(day || data.day || ''));
        if (!r.ok) {
            const j = await r.json() as {
                error?: string;
            };
            throw Error(j.error || 'Não foi possível exportar.');
        }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'historico-' + (day || data.day) + '.xlsx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function act(body: {
        action: string;
        [key: string]: unknown;
    }) { setBusy(true); setError(''); try {
        const j = await api(body);
        await refresh();
        setNotice(body.action === 'create' ? `Senha ${j.result.code} registrada. O paciente já está na fila.` : 'Alteração salva.');
        return j.result;
    }
    catch (e) {
        setError((e as Error).message);
        return null;
    }
    finally {
        setBusy(false);
    } }
    if (data.me && view === 'tv')
        return <TV data={data} online={online}/>;
    if (!data.me)
        return data.tvPending ? <div className="tv tv-pending"><HeartPulse size={64}/><h1>Aguardando liberação.</h1><p>A recepção ou a administração precisa autorizar esta televisão.</p></div> : <Login />;
    const me = data.me;
    const admin = me.role === 'admin';
    const reception = admin || me.role === 'reception';
    const operator = admin || me.role in SERVICES;
    const patients = data.patients ?? [];
    const waiting = patients.filter(p => p.status === 'waiting' && p.day === data.day).sort((a, b) => Number(b.priority) - Number(a.priority) || a.queued - b.queued);
    const pending = patients.filter(p => isPending(p) && p.owner === me.email);
    const nav: [
        string,
        string,
        LucideIcon
    ][] = [];
    if (reception)
        nav.push(['reception', 'Recepção', Users]);
    if (operator)
        nav.push(['operator', 'Atendimento', ClipboardList], ['history', 'Histórico', History]);
    if (admin)
        nav.push(['tv', 'Painel da TV', Monitor], ['settings', 'Equipe e acessos', Settings]);
    function row(p: Patient, history = false) {
        const own = admin || reception || !p.owner || p.owner === me.email;
        return <div key={p.id} className="row"><div style={{ flex: 1 }}><span className={'tag ' + p.service}>{p.code}</span><strong>{p.name}</strong>{p.priority && <span className="badge"> • Prioritário</span>}<p>{SERVICES[p.service]} · {time(p.created)} · {status[p.status]}{p.status === 'calling' && !p.announced ? ' — aguardando anúncio' : ''}</p>{p.owner === me.email && isPending(p) && <p className="badge">{p.subsequent.length}/3 pacientes distintos chamados depois deste</p>}{history && <details><summary className="muted">Ver movimentações e horários</summary><div className="details">{p.events.map(e => `${time(e.at)} · ${e.text}`).join('\n')}</div></details>}{editing === p.id && <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await act({ action: 'edit', id: p.id, name: f.get('name'), priority: f.get('priority') === 'on' }))
            setEditing(null); }}><input name="name" aria-label="Nome corrigido" defaultValue={p.name} required maxLength={160}/><label className="check"><input name="priority" type="checkbox" defaultChecked={p.priority}/> Prioritário</label><button disabled={busy} className="secondary">Salvar correção</button></form>}</div>{!history && own && <div className="actions">
 {operator && p.status === 'calling' && <button className="secondary" disabled={busy || !p.announced} onClick={() => act({ action: 'start', id: p.id })}>Iniciar atendimento</button>}
 {operator && p.status === 'serving' && <button className="secondary" disabled={busy} onClick={() => act({ action: 'finish', id: p.id })}>{p.next.length ? 'Concluir e encaminhar' : 'Encerrar atendimento'}</button>}
 {operator && isPending(p) && <button className="secondary" disabled={busy} onClick={() => act({ action: 'recall', id: p.id, location })}>Rechamar</button>}
 {isPending(p) && <button className="secondary" disabled={busy || !p.announced} onClick={() => act({ action: 'absent', id: p.id })}>Ausente</button>}
 {p.status === 'absent' && p.day === data.day && <button className="secondary" disabled={busy} onClick={() => act({ action: 'return', id: p.id })}>Retornar à fila</button>}
 {['waiting', 'calling', 'serving'].includes(p.status) && <><select aria-label={'Ações para ' + p.name} value="" disabled={busy} onChange={e => { const a = e.target.value; if (a === 'edit') {
                setEditing(editing === p.id ? null : p.id);
                return;
            } if (a.startsWith('transfer-'))
                void act({ action: 'transfer', id: p.id, service: a.slice(9) });
            else
                void act({ action: a, id: p.id }); }}><option value="" disabled>Mais ações</option>{reception && p.status === 'waiting' && <option value="edit">Corrigir cadastro</option>}{Object.entries(SERVICES).filter(([id]) => id !== p.service).map(([id, n]) => <option key={id} value={'transfer-' + id}>Transferir: {n}</option>)}<option value="left">Registrar que foi embora</option><option value="cancelled">Cancelar senha</option></select></>}
 </div>}</div>;
    }
    return <div className="shell"><aside><div className="brand"><HeartPulse /> guichê</div><small>UNIDADE DE ATENDIMENTO</small><nav>{nav.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { if (id === 'tv') {
        window.open('/?panel=tv', '_blank', 'noopener');
        return;
    } setView(id); setNotice(''); setError(''); }}><Icon />{label}</button>)}</nav><div style={{ position: 'absolute', bottom: 30, fontSize: 13, maxWidth: 190, overflowWrap: 'anywhere' }}>{me.name}<p style={{ color: '#b4cbd5' }}>{admin ? 'Administração' : SERVICES[me.role as Service] || 'Recepção'}</p><button className="secondary" onClick={() => void signOut()}>Sair da conta</button></div></aside><main><header><span>UNIDADE DE ATENDIMENTO</span><span>{online ? 'Conectado · atualização automática' : 'Sem conexão'}</span></header><section className="heading"><div><p className="eyebrow">{view === 'reception' ? 'RECEPÇÃO' : view === 'operator' ? 'ATENDIMENTO' : view === 'history' ? 'HISTÓRICO' : 'ADMINISTRAÇÃO'}</p><h1>{view === 'reception' ? <>Um bom atendimento<br />começa aqui.</> : view === 'operator' ? 'Sua fila, no seu ritmo.' : view === 'history' ? 'Cada atendimento registrado.' : 'Equipe e acessos.'}</h1><p>{view === 'reception' ? 'Registre a chegada e encaminhe o paciente para a fila certa.' : view === 'operator' ? 'Chame o próximo paciente quando houver disponibilidade.' : view === 'history' ? 'Consulte o movimento completo de cada dia.' : 'Defina a atividade e o local de atendimento de cada responsável.'}</p></div><b>{date(data.day || '')}</b></section>{!online && <div className="error" role="alert">Conexão interrompida. As informações podem estar desatualizadas.</div>}{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
 {view === 'reception' && <><TelevisionControl /><div className="stats">{Object.entries(SERVICES).map(([id, name]) => <div className={'stat ' + id} key={id}><span>{name}</span><strong>{waiting.filter(p => p.service === id).length} <small>aguardando</small></strong></div>)}</div><div className="columns"><section className="card"><h2>Novo paciente</h2><form onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await act({ action: 'create', name: f.get('name'), service, priority: f.get('priority') === 'on', next: f.getAll('next') }))
        form.reset(); }}><label>Nome completo<input name="name" placeholder="Como o paciente se chama?" required minLength={2} maxLength={160} autoComplete="off"/></label><label>Atividade<select value={service} onChange={e => setService(e.target.value as Service)}>{Object.entries(SERVICES).map(([id, n]) => <option value={id} key={id}>{n} • {id === 'AC' ? 'Rosa' : id === 'RM' ? 'Amarela' : 'Branca'}</option>)}</select></label><label className="check"><input type="checkbox" name="priority"/> Atendimento prioritário</label><details><summary className="muted">Também precisa de outra atividade?</summary><p className="muted">Será encaminhado após concluir a primeira.</p>{Object.entries(SERVICES).filter(([id]) => id !== service).map(([id, n]) => <label className="check" key={id}><input name="next" value={id} type="checkbox"/>{n}</label>)}</details><button style={{ marginTop: 22 }} className="primary" disabled={busy || !online}>Registrar chegada</button></form></section><section className="card"><h2>Pacientes de hoje</h2><div className="toolbar"><select aria-label="Filtrar atividade" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todas as atividades</option>{Object.entries(SERVICES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>{patients.filter(p => p.day === data.day && (!filter || p.service === filter)).length ? patients.filter(p => p.day === data.day && (!filter || p.service === filter)).sort((a, b) => a.created - b.created).map(p => row(p)) : <div className="empty"><Users size={38}/><h3>Tudo pronto para receber</h3><p>As chegadas registradas aparecerão aqui.</p></div>}</section></div></>}
 {view === 'operator' && <><section className="card"><div className="toolbar">{admin && <><select aria-label="Atividade do atendimento" value={service} onChange={e => setService(e.target.value as Service)}>{Object.entries(SERVICES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select><input aria-label="Local de atendimento" value={location} onChange={e => setLocation(e.target.value)} style={{ width: 220, margin: 0 }}/></>}{!admin && <h2>{SERVICES[me.role as Service]} · {me.location}</h2>}</div>{pending.length > 0 && <div className="notice"><strong>Há {pending.length} atendimento(s) sem conclusão.</strong><p>Após chamar outros três pacientes distintos, cada pendência será encerrada automaticamente. Rechamadas não contam.</p><label className="check"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/> Estou ciente e quero chamar o próximo.</label></div>}<button className="primary" disabled={busy || !online || !waiting.some(p => p.service === service) || (pending.length > 0 && !ack)} onClick={async () => { if (await act({ action: 'call', service, location, acknowledge: ack }))
        setAck(false); }}>Chamar próximo paciente · {waiting.filter(p => p.service === service).length} aguardando</button></section><div className="columns" style={{ marginTop: 24 }}><section className="card"><h2>Meus atendimentos pendentes</h2>{pending.length ? pending.map(p => row(p)) : <div className="empty"><ClipboardList /><p>Nenhum atendimento pendente.</p></div>}</section><section className="card"><h2>Fila de espera</h2>{waiting.filter(p => p.service === service).map(p => row(p))}{!waiting.some(p => p.service === service) && <p>Nenhum paciente aguardando.</p>}<h2 style={{ marginTop: 24 }}>Ausentes</h2>{patients.filter(p => p.status === 'absent' && p.service === service).map(p => row(p))}</section></div></>}
 {view === 'history' && <><div className="toolbar"><button className="secondary" disabled={busy || !online} onClick={() => void exportHistory()}>Exportar Excel do dia</button><input type="date" aria-label="Dia do histórico" value={day || data.day || ''} onChange={e => setDay(e.target.value)} style={{ width: 180, margin: 0 }}/>{(data.dates ?? []).map(d => <button key={d} className={'datebutton ' + ((day || data.day) === d ? 'selected' : '')} onClick={() => setDay(d)}>{date(d)}</button>)}</div><section className="card"><h2>{date(day || data.day || '')} · {patients.filter(p => p.day === (day || data.day)).length} registros</h2><p className="muted">Ordem de chegada. Pacientes transferidos aparecem somente na atividade final.</p>{patients.filter(p => p.day === (day || data.day)).sort((a, b) => a.created - b.created).map(p => row(p, true))}{!patients.length && <p>Ainda não há registros nesta data.</p>}</section></>}
 {view === 'settings' && admin && <><TelevisionControl /><Team members={data.members ?? []} refresh={refresh} currentMemberId={me.email}/></>}
 </main>{!isReserveAdmin(me) && <InternalChat key={me.email} memberId={me.email}/>}</div>;
}
function TV({ data, online }: {
    data: Data;
    online: boolean;
}) {
    const { preferences, ready, blocked, unlock, beep, error: audioError } = useTelevisionAudio();
    const [current, setCurrent] = useState<Announcement | null>(null), [error, setError] = useState('');
    const lease = useRef('');
    const handling = useRef(false);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    useEffect(() => { lease.current = crypto.randomUUID(); }, []);
    useEffect(() => { let stopped = false; const tick = async () => { if (handling.current || stopped)
        return; handling.current = true; try {
        const { result: a } = await api<Announcement | null>({ action: 'claimAnnouncement', lease: lease.current });
        if (!a)
            return;
        setCurrent(a);
        setError('');
        const duration = new Promise(resolve => setTimeout(resolve, 7000));
        if (preferences.current.chime)
            await beep();
        const speech = new Promise<void>(resolve => { if (!preferences.current.voice || !ready.current) {
            resolve();
            return;
        } if (!('speechSynthesis' in window)) {
            setError('Voz indisponível neste navegador. A chamada continuará na tela.');
            resolve();
            return;
        } const utterance = new SpeechSynthesisUtterance(spokenName(a.name)); if (!configurePatientVoice(utterance, speechSynthesis.getVoices())) {
            setError('Nenhuma voz local em português está disponível nesta televisão. A chamada visual continua normalmente.');
            resolve();
            return;
        } utterance.onend = () => { clearTimeout(timeout); resolve(); }; utterance.onerror = () => { clearTimeout(timeout); setError('Não foi possível reproduzir a voz. Confira o áudio da TV.'); resolve(); }; const timeout = setTimeout(() => { speechSynthesis.cancel(); resolve(); }, 35000); speechSynthesis.speak(utterance); });
        await Promise.all([duration, speech]);
        if (!stopped) {
            await api({ action: 'finishAnnouncement', id: a.id, lease: lease.current }); /* Keep the announced patient visible until the next announcement. */
        }
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        handling.current = false;
    } }; void tick(); const timer = setInterval(() => void tick(), 1500); return () => { stopped = true; clearInterval(timer); window.speechSynthesis?.cancel(); }; }, [preferences, ready, beep]);
    const displayed = lastDisplayedAnnouncement(data.announcements ?? [], current);
    const waiting = (data.patients ?? []).filter(p => p.status === 'waiting');
    const recent = (data.announcements ?? []).filter(a => a.started && a.id !== displayed?.id).slice(-6).reverse();
    return <TelevisionScreen current={displayed} recent={recent} waiting={waiting} enabled={!blocked} now={now} warning={!online ? 'Sem conexão. Aguardando reconexão.' : error || audioError || undefined} onEnable={() => void unlock()}/>;
}
