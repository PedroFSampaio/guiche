import { z } from 'zod';
const service = z.enum(['AC', 'RM', 'ED']);
export const queueInput = z.object({
    action: z.enum(['create', 'call', 'claimAnnouncement', 'finishAnnouncement', 'edit', 'recall', 'start', 'return', 'transfer', 'finish', 'absent', 'left', 'cancelled']),
    id: z.string().max(100).optional(), name: z.string().max(160).optional(),
    service: service.optional(), next: z.array(service).max(2).optional(),
    priority: z.boolean().optional(), acknowledge: z.boolean().optional(),
    lease: z.string().min(1).max(99).optional(), location: z.string().max(80).optional()
}).strict();
export const authInput = z.discriminatedUnion('action', [
    z.object({ action: z.literal('login'), username: z.string().max(100), password: z.string().max(128) }).strict(),
    z.object({ action: z.literal('bootstrap'), username: z.string().max(40), password: z.string().max(128) }).strict(),
    z.object({ action: z.literal('logout') }).strict(),
    z.object({ action: z.literal('member'), id: z.string().max(100).optional(), username: z.string().max(40), password: z.string().max(128).optional(), name: z.string().max(100), role: z.enum(['admin', 'reception', 'tv', 'AC', 'RM', 'ED']), location: z.string().max(80).optional() }).strict(),
    z.object({ action: z.literal('deleteMember'), id: z.string().max(100) }).strict(),
    z.object({ action: z.literal('approveTV'), id: z.string().max(100) }).strict(),
    z.object({ action: z.literal('disconnectTV'), id: z.string().max(100) }).strict(),
    z.object({ action: z.literal('tvAudio'), setting: z.enum(['voice', 'chime']), enabled: z.boolean() }).strict()
]);
export async function readInput<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
    const text = await request.text();
    if (text.length > 16384)
        throw Error('Solicitação excede o tamanho permitido.');
    let value: unknown;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw Error('Solicitação inválida.');
    }
    const result = schema.safeParse(value);
    if (!result.success)
        throw Error('Solicitação inválida. Confira os campos informados.');
    return result.data;
}
