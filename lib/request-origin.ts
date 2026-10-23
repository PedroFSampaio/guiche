// Public deployment served by the municipality's HTTPS reverse proxy.
const deploymentOrigins = ['https://chat.saomanuel.sp.gov.br'];

export function publicOrigin(): string | null {
    const value = process.env.GUICHE_PUBLIC_ORIGIN;
    if (!value)
        return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
        throw Error('O endereço de rede deve usar HTTPS e não pode conter caminho ou credenciais.');
    return url.origin;
}
function originForHost(headers: Headers): string | null {
    const host = headers.get('host') ?? '';
    const configured = publicOrigin();
    return [...deploymentOrigins, ...(configured ? [configured] : [])]
        .find(origin => new URL(origin).host === host) ?? null;
}
export function requestUsesHttps(headers: Headers): boolean {
    return originForHost(headers) !== null;
}
export function requestHostAllowed(headers: Headers) {
    const host = headers.get('host') ?? '';
    if (originForHost(headers))
        return true;
    return !publicOrigin() && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
}
export function validateOrigin(request: Request, local = false) {
    const origin = request.headers.get('origin');
    if (local && !requestHostAllowed(request.headers))
        throw Error('Origem da solicitação não autorizada.');
    if (!origin)
        return;
    const expected = local ? (originForHost(request.headers) ?? new URL('http://' + request.headers.get('host')).origin) : new URL(request.url).origin;
    if (origin !== expected)
        throw Error('Origem da solicitação não autorizada.');
}
