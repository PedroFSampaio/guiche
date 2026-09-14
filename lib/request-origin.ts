export function publicOrigin(): string | null {
    const value = process.env.GUICHE_PUBLIC_ORIGIN;
    if (!value)
        return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
        throw Error('O endereço de rede deve usar HTTPS e não pode conter caminho ou credenciais.');
    return url.origin;
}
export function requestHostAllowed(headers: Headers) {
    const host = headers.get('host') ?? '';
    const origin = publicOrigin();
    if (origin)
        return host === new URL(origin).host;
    return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
}
export function validateOrigin(request: Request, local = false) {
    const origin = request.headers.get('origin');
    if (local && !requestHostAllowed(request.headers))
        throw Error('Origem da solicitação não autorizada.');
    if (!origin)
        return;
    const expected = local ? (publicOrigin() ?? new URL('http://' + request.headers.get('host')).origin) : new URL(request.url).origin;
    if (origin !== expected)
        throw Error('Origem da solicitação não autorizada.');
}
