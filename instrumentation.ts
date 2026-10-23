export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs')
        return;
    if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.GUICHE_BUILD === '1')
        return;
    const username = process.env.GUICHE_ADMIN_USER;
    const password = process.env.GUICHE_ADMIN_PASSWORD;
    if (!username || !password)
        return;
    try {
        const { ensureDefaultAdmin } = await import('./lib/local-auth');
        if (ensureDefaultAdmin())
            console.log('Administrador padrão criado: ' + username);
    }
    catch (error) {
        console.error('Falha ao criar administrador padrão:', error instanceof Error ? error.message : error);
    }
}
