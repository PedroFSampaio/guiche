import { queueInput, readInput } from '../../../lib/request-input';
import { historyWorkbook } from '../../../lib/history-export';
import { visibleQueue } from '../../../lib/visible-queue';
import { validateOrigin } from '../../../lib/request-origin';
import { env } from '@/lib/runtime-env';
import { getCurrentUser } from '../../server-session';
import { mutate, dayKey, type State } from '../../../lib/queue';
export const dynamic = 'force-dynamic';
function database() { if (!env.DB)
    throw Error('Banco de dados indisponível.'); return env.DB; }
// One versioned metadata record serializes mutations; patient and announcement
// records are stored separately to avoid an ever-growing SQLite value.
async function read() {
    const db = database();
    await db.prepare('INSERT OR IGNORE INTO unit_state (id,version,data) VALUES (?,0,?)').bind('unit', JSON.stringify({ members: [], counters: {} })).run();
    const result = await db.batch([db.prepare('SELECT version,data FROM unit_state WHERE id=?').bind('unit'), db.prepare('SELECT id,data FROM unit_state WHERE id<>?').bind('unit')]);
    const root = result[0].results[0] as unknown as {
        version: number;
        data: string;
    };
    if (!root)
        throw Error('Não foi possível carregar a unidade.');
    const meta = JSON.parse(root.data);
    const state: State = { members: meta.members ?? [], counters: meta.counters ?? {}, patients: meta.patients ?? [], announcements: meta.announcements ?? [] };
    const previous = new Map<string, string>();
    for (const r of result[1].results as unknown as {
        id: string;
        data: string;
    }[]) {
        previous.set(r.id, r.data);
        if (r.id.startsWith('p:'))
            state.patients.push(JSON.parse(r.data));
        else if (r.id.startsWith('a:'))
            state.announcements.push(JSON.parse(r.data));
    }
    state.patients.sort((a, b) => a.created - b.created);
    state.announcements.sort((a, b) => a.created - b.created);
    return { version: root.version, state, previous };
}
async function save(state: State, version: number, previous: Map<string, string>) {
    const db = database();
    const token = crypto.randomUUID();
    const statements = [db.prepare('UPDATE unit_state SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify({ members: state.members, counters: state.counters, writeToken: token }), 'unit', version)];
    const rows = [...state.patients.map(p => ({ id: 'p:' + p.id, data: JSON.stringify(p) })), ...state.announcements.map(a => ({ id: 'a:' + a.id, data: JSON.stringify(a) }))];
    for (const r of rows)
        if (previous.get(r.id) !== r.data)
            statements.push(db.prepare("INSERT INTO unit_state (id,version,data) SELECT ?,0,? WHERE EXISTS (SELECT 1 FROM unit_state WHERE id='unit' AND json_extract(data,'$.writeToken')=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=unit_state.version+1").bind(r.id, r.data, token));
    const result = await db.batch(statements);
    return result[0].meta.changes === 1;
}
async function identity() { const user = await getCurrentUser(); if (!user)
    throw Error('Entre na sua conta para acessar a unidade.'); return { ...user, email: user.email.toLowerCase() }; }
function fail(e: unknown) { const message = e instanceof Error ? e.message : 'Falha inesperada.'; return Response.json({ error: message }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            const { sessionMember } = await import('../../../lib/local-auth');
            const pending = sessionMember(request.headers.get('cookie'), true);
            return Response.json({ login: true, tvPending: pending?.role === 'tv' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        }
        const { state } = await read();
        const me = state.members.find(m => m.email === user.email);
        if (!me)
            return Response.json({ login: true }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        const params = new URL(request.url).searchParams;
        if (params.get('export') === 'xlsx') {
            const day = params.get('day') || dayKey();
            const bytes = historyWorkbook(state, me, day);
            return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename=historico-' + day + '.xlsx', 'Cache-Control': 'no-store' } });
        }
        return Response.json(visibleQueue(state, me, params.get('day')), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return fail(e);
    }
}
export async function POST(request: Request) {
    try {
        validateOrigin(request, true);
        const user = await identity();
        const body = await readInput(request, queueInput);
        for (let attempt = 0; attempt < 24; attempt++) {
            const { state, version, previous } = await read();
            const me = state.members.find(m => m.email === user.email);
            if (!me)
                throw Error('Seu acesso não está autorizado.');
            const result = mutate(state, me, body);
            if (await save(state, version, previous))
                return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
            await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 20));
        }
        throw Error('Outra operação está em andamento. Tente novamente.');
    }
    catch (e) {
        return fail(e);
    }
}
