"use client";
import type { AuthStatus, TelevisionSession } from '../lib/client-types';
import { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { SERVICES, type Member, type Service } from '../lib/queue';
export async function authAction(body: unknown) {
    const response = await fetch('/api/auth', { signal: AbortSignal.timeout(15000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as {
        error?: string;
    };
    if (!response.ok)
        throw Error(result.error || 'Não foi possível concluir.');
    return result;
}
export async function signOut() { await authAction({ action: 'logout' }); window.location.reload(); }
export function Login() {
    const [bootstrap, setBootstrap] = useState<boolean | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { fetch('/api/auth').then(r => r.json()).then(j => setBootstrap((j as AuthStatus).bootstrap)).catch(() => setError('Não foi possível conectar. Atualize a página.')); }, []);
    return <div className="login card"><div className="brand"><HeartPulse /> guichê</div><h1>{bootstrap ? 'Configure seu acesso.' : 'Bem-vindo de volta.'}</h1><p>{bootstrap ? 'Defina o usuário e a senha da administração. Os cadastros e as filas existentes serão preservados.' : 'Entre com o usuário e a senha fornecidos pela administração.'}</p>{error && <div className="error" role="alert">{error}</div>}<form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (bootstrap && f.get('password') !== f.get('confirm')) {
        setError('As senhas não coincidem.');
        return;
    } setBusy(true); setError(''); try {
        await authAction({ action: bootstrap ? 'bootstrap' : 'login', username: f.get('username'), password: f.get('password') });
        window.location.reload();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}><label>Usuário<input name="username" autoComplete="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._\-]+" autoCapitalize="none" spellCheck={false}/></label><label>Senha<input name="password" type="password" autoComplete={bootstrap ? 'new-password' : 'current-password'} required minLength={bootstrap ? 8 : 1} maxLength={128}/></label>{bootstrap && <><label>Confirme a senha<input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128}/></label><p className="muted">Use pelo menos 8 caracteres na senha.</p></>}<button className="primary" disabled={busy || bootstrap === null}>{busy ? 'Aguarde…' : bootstrap ? 'Criar acesso de administrador' : 'Entrar'}</button></form>{!bootstrap && <p className="muted">Esqueceu seu usuário ou senha? Solicite a alteração ao administrador.</p>}</div>;
}
export function Team({ members, refresh, currentMemberId }: {
    members: Member[];
    currentMemberId: string;
    refresh: () => Promise<unknown>;
}) {
    const [editing, setEditing] = useState<Member | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
    async function remove(member: Member) {
        if (!window.confirm('Excluir o acesso de ' + member.name + '? O usuário será desconectado e não poderá mais entrar. O histórico dos atendimentos será preservado.'))
            return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await authAction({ action: 'deleteMember', id: member.email });
            if (editing?.email === member.email)
                setEditing(null);
            setNotice('Acesso excluído. As sessões do usuário foram encerradas.');
            await refresh();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return <><div aria-live="polite">{error && <div className="error">{error}</div>}{notice && <div className="notice">{notice}</div>}</div><div className="columns"><section className="card"><h2>{editing ? 'Editar funcionário' : 'Cadastrar funcionário'}</h2><form key={(editing?.email || 'new') + revision} onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError(''); setNotice(''); try {
        await authAction({ action: 'member', id: editing?.email, name: f.get('name'), username: f.get('username'), password: f.get('password'), role: f.get('role'), location: f.get('location') });
        setNotice('Acesso salvo. Se já estava conectado, o funcionário deverá entrar novamente.');
        setEditing(null);
        setRevision(x => x + 1);
        await refresh();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}><label>Nome<input name="name" defaultValue={editing?.name} required maxLength={100}/></label><label>Usuário<input name="username" defaultValue={editing?.username} required minLength={3} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label><label>{editing?.username ? 'Nova senha (opcional)' : 'Senha'}<input name="password" type="password" required={!editing?.username} minLength={8} maxLength={128} autoComplete="new-password"/></label><p className="muted">{editing?.username ? 'Deixe em branco para manter a senha atual. ' : ''}A senha deve ter pelo menos 8 caracteres.</p><label>Função<select name="role" defaultValue={editing?.role || 'reception'}><option value="reception">Recepção</option>{Object.entries(SERVICES).map(([id, name]) => <option key={id} value={id}>Atendimento — {name}</option>)}<option value="tv">Painel da TV</option><option value="admin">Administração</option></select></label><label>Local de atendimento<input name="location" defaultValue={editing?.location} placeholder="Ex.: Guichê 2" maxLength={80}/></label><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar acesso'}</button>{editing && <button type="button" className="secondary" style={{ marginTop: 12 }} onClick={() => { setEditing(null); setError(''); }}>Cancelar edição</button>}</form></section><section className="card"><h2>Funcionários cadastrados</h2>{members.map(m => <div className="row" key={m.email}><div><strong>{m.name}</strong><p>{m.username || 'Usuário e senha ainda não definidos'}</p><p>{SERVICES[m.role as Service] || { admin: 'Administração', reception: 'Recepção', tv: 'Painel da TV' }[m.role as 'admin' | 'reception' | 'tv']}{m.location && ' · ' + m.location}</p></div><div className="actions"><button className="secondary" disabled={busy} onClick={() => { setEditing(m); setError(''); setNotice(''); }}>Editar acesso</button>{m.email !== currentMemberId && <button className="secondary danger" disabled={busy} onClick={() => void remove(m)}>Excluir acesso</button>}</div></div>)}<p className="muted">Em Editar acesso, altere usuário, senha, função e local de atendimento.</p></section></div></>;
}
export function TelevisionControl() {
    const [audio, setAudio] = useState({ voice: false, chime: false });
    const [sessions, setSessions] = useState<TelevisionSession[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function refresh() { try {
        const r = await fetch('/api/auth');
        const j = await r.json() as AuthStatus;
        setSessions(j.televisions ?? []);
        if (j.audio)
            setAudio(j.audio);
    }
    catch {
        setError('Não foi possível consultar as televisões.');
    } }
    useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 2000); return () => { clearTimeout(initial); clearInterval(timer); }; }, []);
    async function control(id: string, action: string) { setBusy(true); setError(''); try {
        await authAction({ action, id });
        await refresh();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function toggleAudio(setting: 'voice' | 'chime') { setBusy(true); setError(''); try {
        await authAction({ action: 'tvAudio', setting, enabled: !audio[setting] });
        await refresh();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="card television-control"><h2>Controle da televisão</h2><div className="toolbar"><button className="secondary" aria-pressed={audio.voice} disabled={busy} onClick={() => void toggleAudio('voice')}>Chamadas por voz: {audio.voice ? 'ativadas' : 'desativadas'}</button><button className="secondary" aria-pressed={audio.chime} disabled={busy} onClick={() => void toggleAudio('chime')}>Aviso de chamados: {audio.chime ? 'ativado' : 'desativado'}</button></div><p className="muted">A voz fala o nome do paciente. O aviso toca um som suave antes de cada chamada. Você pode usar um deles ou os dois. Ao ativar, a TV toca uma confirmação suave.</p><p className="muted">Faça login com a conta da TV no painel. A conexão aparecerá aqui para liberação.</p>{error && <div className="error">{error}</div>}{!sessions.length && <p>Nenhuma televisão conectada ou aguardando liberação.</p>}{sessions.map(s => <div className="row" key={s.id}><div><strong>{s.name}</strong><p>{s.username} · {s.approved ? 'Painel liberado' : 'Aguardando liberação'}</p></div><div className="actions">{!s.approved && <button className="secondary" disabled={busy} onClick={() => void control(s.id, 'approveTV')}>Liberar televisão</button>}<button className="secondary" disabled={busy} onClick={() => void control(s.id, 'disconnectTV')}>Desconectar televisão</button></div></div>)}</section>;
}
