import { authInput, readInput } from '../../../lib/request-input';
import { COOKIE, MAX_AGE, bootstrap, login, logout, needsBootstrap, sessionMember, saveMember, televisionSessions, controlTelevision, deviceSessions, controlKiosk, televisionAudio, setTelevisionAudio, deleteMember } from '../../../lib/local-auth';
import { validateOrigin, requestHostAllowed, requestUsesHttps } from '../../../lib/request-origin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
    if (!requestHostAllowed(request.headers))
        return Response.json({ error: 'Origem não autorizada.' }, { status: 403, headers });
    const me = sessionMember(request.headers.get('cookie'));
    const pending = sessionMember(request.headers.get('cookie'), true);
    const staff = me && ['admin', 'reception'].includes(me.role);
    return Response.json({ bootstrap: needsBootstrap(), me, audio: me && ['admin', 'reception', 'tv'].includes(me.role) ? televisionAudio() : undefined, tvPending: !me && pending?.role === 'tv', televisions: staff ? televisionSessions(me) : undefined, kiosks: staff ? deviceSessions(me, 'kiosk') : undefined }, { headers });
}
export async function POST(request: Request) {
    try {
        validateOrigin(request, true);
        const body = await readInput(request, authInput);
        let token: string | undefined;
        if (body.action === 'login')
            token = login(body.username, body.password);
        else if (body.action === 'bootstrap')
            token = bootstrap(body);
        else if (body.action === 'logout')
            logout(request.headers.get('cookie'));
        else if (body.action === 'approveTV' || body.action === 'disconnectTV' || body.action === 'approveKiosk' || body.action === 'disconnectKiosk') {
            const actor = sessionMember(request.headers.get('cookie'));
            if (!actor)
                throw Error('Entre na sua conta.');
            if (body.action === 'approveTV' || body.action === 'disconnectTV')
                controlTelevision(actor, body.id, body.action);
            else
                controlKiosk(actor, body.id, body.action === 'approveKiosk');
        }
        else if (body.action === 'tvAudio') {
            const actor = sessionMember(request.headers.get('cookie'));
            if (!actor)
                throw Error('Entre na sua conta.');
            setTelevisionAudio(actor, body.setting, body.enabled);
        }
        else if (body.action === 'member') {
            const actor = sessionMember(request.headers.get('cookie'));
            if (!actor)
                return Response.json({ error: 'Entre na sua conta.' }, { status: 401, headers });
            saveMember(actor, body);
        }
        else if (body.action === 'deleteMember') {
            const actor = sessionMember(request.headers.get('cookie'));
            if (!actor)
                return Response.json({ error: 'Entre na sua conta.' }, { status: 401, headers });
            deleteMember(actor, body.id);
        }
        else
            throw Error('Ação inválida.');
        const response = Response.json({ ok: true }, { headers });
        if (token || body.action === 'logout')
            response.headers.set('Set-Cookie', `${COOKIE}=${token ?? ''}; HttpOnly; SameSite=Strict; Path=/;${requestUsesHttps(request.headers) ? ' Secure;' : ''} Max-Age=${token ? MAX_AGE : 0}`);
        return response;
    }
    catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Falha ao autenticar.' }, { status: 400, headers });
    }
}
