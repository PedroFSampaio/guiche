import { isReserveAdmin, RESERVE_ADMIN_ID } from './reserve-admin.ts';
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { sqlite } from './local-env.ts';
import type { Member, Patient, Announcement } from './queue.ts';
sqlite.exec(`CREATE TABLE IF NOT EXISTS credentials (member TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, member TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (username TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until INTEGER NOT NULL);`);
sqlite.exec('BEGIN IMMEDIATE');
try {
    if (!sqlite.prepare('PRAGMA table_info(sessions)').all().some(column => column.name === 'approved'))
        sqlite.exec('ALTER TABLE sessions ADD COLUMN approved INTEGER NOT NULL DEFAULT 0');
    sqlite.exec('COMMIT');
}
catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
}
export const COOKIE = 'guiche_session';
export const MAX_AGE = 43200;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function normalizeUsername(value: unknown) {
    const username = String(value ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username))
        throw Error('Use um usuário de 3 a 40 letras, números, pontos, hífens ou sublinhados.');
    return username;
}
function hashPassword(value: unknown) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128)
        throw Error('A senha deve ter entre 8 e 128 caracteres.');
    const salt = randomBytes(16).toString('hex');
    return salt + ':' + scryptSync(value, salt, 64).toString('hex');
}
const dummy = hashPassword(randomBytes(24).toString('hex'));
function verify(password: string, stored: string) {
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
type Metadata = {
    members: Member[];
    counters: Record<string, number>;
    patients?: Patient[];
    announcements?: Announcement[];
    writeToken?: string;
};
function metadata(): Metadata {
    const row = sqlite.prepare("SELECT data FROM unit_state WHERE id='unit'").get();
    return row ? JSON.parse(String(row.data)) : { members: [], counters: {} };
}
function writeMetadata(meta: Metadata) {
    sqlite.prepare("INSERT INTO unit_state (id,version,data) VALUES ('unit',1,?) ON CONFLICT(id) DO UPDATE SET version=version+1,data=excluded.data").run(JSON.stringify(meta));
}
export function needsBootstrap() { return !sqlite.prepare('SELECT 1 FROM credentials LIMIT 1').get(); }
export function sessionMember(cookie: string | null, includePending = false): Member | null {
    const token = cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
        return null;
    const session = sqlite.prepare('SELECT member,approved FROM sessions WHERE token=? AND expires>?').get(digest(token), Date.now());
    const member = session ? metadata().members.find((m: Member) => m.email === session.member) ?? null : null;
    return member?.role === 'tv' && !session?.approved && !includePending ? null : member;
}
export function logout(cookie: string | null) {
    if (sessionMember(cookie, true)?.role === 'tv')
        throw Error('Somente a administração ou recepção pode desconectar a TV.');
    const token = cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (token)
        sqlite.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
}
function createSession(member: string) {
    const token = randomBytes(32).toString('hex');
    sqlite.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    sqlite.prepare('INSERT INTO sessions (token,member,expires) VALUES (?,?,?)').run(digest(token), member, Date.now() + MAX_AGE * 1000);
    return token;
}
export function login(usernameValue: unknown, passwordValue: unknown) {
    const username = String(usernameValue ?? '').trim().toLowerCase().slice(0, 100);
    const attempt = sqlite.prepare('SELECT * FROM login_attempts WHERE username=?').get(username);
    if (attempt && Number(attempt.until) > Date.now() && Number(attempt.attempts) >= 5)
        throw Error('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
    const row = sqlite.prepare('SELECT * FROM credentials WHERE username=?').get(username);
    const password = typeof passwordValue === 'string' ? passwordValue : '';
    const valid = password.length <= 128 && verify(password, row ? String(row.hash) : dummy);
    if (!valid || !row) {
        const count = attempt && Number(attempt.until) > Date.now() ? Number(attempt.attempts) + 1 : 1;
        sqlite.prepare('INSERT OR REPLACE INTO login_attempts VALUES (?,?,?)').run(username, count, Date.now() + 900000);
        throw Error('Usuário ou senha incorretos.');
    }
    sqlite.prepare('DELETE FROM login_attempts WHERE username=?').run(username);
    return createSession(String(row.member));
}
export function bootstrap(body: {
    username: unknown;
    password: unknown;
}) {
    const username = normalizeUsername(body.username), hash = hashPassword(body.password);
    sqlite.exec('BEGIN IMMEDIATE');
    try {
        if (!needsBootstrap())
            throw Error('A administração já foi configurada.');
        const meta = metadata();
        let admin = meta.members.find((m: Member) => m.email === 'admin@guiche.local' && m.role === 'admin') ?? meta.members.find((m: Member) => m.role === 'admin');
        if (!admin) {
            admin = { email: randomUUID(), name: 'Administrador', role: 'admin', location: '' };
            meta.members.push(admin);
        }
        admin.username = username;
        sqlite.prepare('INSERT INTO credentials VALUES (?,?,?)').run(admin.email, username, hash);
        writeMetadata(meta);
        const token = createSession(admin.email);
        sqlite.exec('COMMIT');
        return token;
    }
    catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
    }
}
export function ensureDefaultAdmin() {
    const username = process.env.GUICHE_ADMIN_USER;
    const password = process.env.GUICHE_ADMIN_PASSWORD;
    if (!username || !password || !needsBootstrap())
        return false;
    bootstrap({ username, password });
    return true;
}
export function saveMember(actor: Member, body: {
    id?: string;
    username?: unknown;
    password?: unknown;
    name?: unknown;
    role: Member['role'];
    location?: unknown;
}) {
    if (actor.role !== 'admin')
        throw Error('Acesso restrito à administração.');
    const username = normalizeUsername(body.username);
    const name = String(body.name ?? '').trim(), location = String(body.location ?? '').trim();
    if (!name || name.length > 100)
        throw Error('Informe um nome de até 100 caracteres.');
    if (!['admin', 'reception', 'tv', 'AC', 'RM', 'ED'].includes(body.role))
        throw Error('Perfil inválido.');
    if (location.length > 80 || (['AC', 'RM', 'ED'].includes(body.role) && !location))
        throw Error('Informe o local de atendimento (até 80 caracteres).');
    const newHash = body.password ? hashPassword(body.password) : null;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
        const meta = metadata();
        if (!meta.members.some((m: Member) => m.email === actor.email && m.role === 'admin'))
            throw Error('Acesso restrito à administração.');
        const existing = body.id ? meta.members.find((m: Member) => m.email === body.id) : null;
        if (body.id === RESERVE_ADMIN_ID && actor.email !== RESERVE_ADMIN_ID)
            throw Error('A conta de reserva é protegida e não pode ser alterada por outros administradores.');
        if (body.id && !existing)
            throw Error('Funcionário não encontrado.');
        if (existing?.email === actor.email && body.role !== 'admin')
            throw Error('Você não pode remover seu próprio acesso de administrador.');
        const id = existing?.email ?? randomUUID();
        const credential = sqlite.prepare('SELECT hash FROM credentials WHERE member=?').get(id);
        if (!credential && !newHash)
            throw Error('Defina uma senha para este funcionário.');
        const duplicate = sqlite.prepare('SELECT member FROM credentials WHERE username=? AND member<>?').get(username, id);
        if (duplicate)
            throw Error('Este nome de usuário já está em uso.');
        if (existing && existing.role !== body.role) {
            const patients = [...(meta.patients ?? []), ...sqlite.prepare("SELECT data FROM unit_state WHERE id LIKE 'p:%'").all().map(r => JSON.parse(String(r.data)) as Patient)];
            if (patients.some(p => p.owner === id && ['calling', 'serving'].includes(p.status)))
                throw Error('Finalize ou transfira os atendimentos pendentes antes de alterar a função.');
        }
        const member = { email: id, username, name, role: body.role, location };
        meta.members = meta.members.filter((m: Member) => m.email !== id);
        meta.members.push(member);
        sqlite.prepare('INSERT INTO credentials VALUES (?,?,?) ON CONFLICT(member) DO UPDATE SET username=excluded.username,hash=excluded.hash').run(id, username, newHash ?? String(credential!.hash));
        sqlite.prepare('DELETE FROM sessions WHERE member=?').run(id);
        sqlite.prepare('DELETE FROM login_attempts WHERE username=?').run(username);
        writeMetadata(meta);
        sqlite.exec('COMMIT');
    }
    catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
    }
}
export function televisionSessions(actor: Member) {
    if (!['admin', 'reception'].includes(actor.role))
        throw Error('Controle da TV restrito à administração e recepção.');
    const members: Member[] = metadata().members;
    return sqlite.prepare('SELECT token,member,expires,approved FROM sessions WHERE expires>?').all(Date.now()).flatMap(session => {
        const member = members.find(m => m.email === session.member && m.role === 'tv');
        return member ? [{ id: session.token, name: member.name, username: member.username, approved: !!session.approved, expires: session.expires }] : [];
    });
}
export function controlTelevision(actor: Member, id: string, action: string) {
    const session = televisionSessions(actor).find(s => s.id === id);
    if (!session)
        throw Error('Conexão da televisão não encontrada.');
    if (action === 'approveTV')
        sqlite.prepare('UPDATE sessions SET approved=1 WHERE token=?').run(id);
    else if (action === 'disconnectTV')
        sqlite.prepare('DELETE FROM sessions WHERE token=?').run(id);
    else
        throw Error('Ação inválida.');
}
sqlite.exec('CREATE TABLE IF NOT EXISTS tv_audio (id INTEGER PRIMARY KEY CHECK(id=1), voice INTEGER NOT NULL DEFAULT 0, chime INTEGER NOT NULL DEFAULT 0, confirmation INTEGER NOT NULL DEFAULT 0)');
sqlite.prepare('INSERT OR IGNORE INTO tv_audio (id) VALUES (1)').run();
export function televisionAudio() {
    const row = sqlite.prepare('SELECT voice,chime,confirmation FROM tv_audio WHERE id=1').get()!;
    return { voice: !!row.voice, chime: !!row.chime, confirmation: Number(row.confirmation) };
}
export function setTelevisionAudio(actor: Member, setting: unknown, enabled: unknown) {
    if (!['admin', 'reception'].includes(actor.role))
        throw Error('Áudio restrito à administração e recepção.');
    if (!['voice', 'chime'].includes(String(setting)) || typeof enabled !== 'boolean')
        throw Error('Configuração de áudio inválida.');
    const previous = televisionAudio();
    const field = setting === 'voice' ? 'voice' : 'chime';
    sqlite.prepare('UPDATE tv_audio SET ' + field + '=?,confirmation=confirmation+? WHERE id=1').run(Number(enabled), enabled && !previous[field] ? 1 : 0);
}
export function deleteMember(actor: Member, id: unknown) {
    if (actor.role !== 'admin')
        throw Error('Acesso restrito à administração.');
    if (typeof id !== 'string' || !id)
        throw Error('Funcionário inválido.');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
        const meta = metadata();
        if (!meta.members.some((m: Member) => m.email === actor.email && m.role === 'admin'))
            throw Error('Acesso restrito à administração.');
        if (id === actor.email)
            throw Error('Você não pode excluir seu próprio acesso.');
        const member = meta.members.find((m: Member) => m.email === id);
        if (!member)
            throw Error('Funcionário não encontrado.');
        if (isReserveAdmin(member))
            throw Error('A conta de reserva é protegida e não pode ser excluída.');
        if (member.role === 'admin' && meta.members.filter((m: Member) => m.role === 'admin').length <= 1)
            throw Error('Mantenha pelo menos um administrador.');
        const rows = sqlite.prepare("SELECT data FROM unit_state WHERE id LIKE 'p:%'").all();
        const patients = [...(meta.patients ?? []), ...rows.map(r => JSON.parse(String(r.data)))];
        if (patients.some(p => p.owner === id && ['calling', 'serving'].includes(p.status)))
            throw Error('Finalize ou transfira os atendimentos pendentes deste funcionário antes de excluir o acesso.');
        const credential = sqlite.prepare('SELECT username FROM credentials WHERE member=?').get(id);
        sqlite.prepare('DELETE FROM sessions WHERE member=?').run(id);
        sqlite.prepare('DELETE FROM credentials WHERE member=?').run(id);
        if (credential)
            sqlite.prepare('DELETE FROM login_attempts WHERE username=?').run(String(credential.username));
        meta.members = meta.members.filter((m: Member) => m.email !== id);
        writeMetadata(meta);
        sqlite.exec('COMMIT');
    }
    catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
    }
}
