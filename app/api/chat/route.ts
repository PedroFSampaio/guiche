import { z } from 'zod';
import { sessionMember } from '../../../lib/local-auth';
import { canChat, chatSnapshot, readChat, sendChat } from '../../../lib/chat';
import { requestHostAllowed, validateOrigin } from '../../../lib/request-origin';
import { readInput } from '../../../lib/request-input';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const input = z.discriminatedUnion('action', [
 z.object({ action: z.literal('send'), recipient: z.string().min(1).max(160), body: z.string().trim().min(1).max(2000), clientId: z.string().uuid() }).strict(),
 z.object({ action: z.literal('read'), conversation: z.string().min(1).max(160), through: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()
]);
async function handle(request: Request) {
 if (!requestHostAllowed(request.headers)) return Response.json({ error: 'Origem não autorizada.' }, { status: 403, headers });
 const actor = sessionMember(request.headers.get('cookie'));
 if (!actor) return Response.json({ error: 'Entre na sua conta.' }, { status: 401, headers });
 if (!canChat(actor)) return Response.json({ error: 'Chat indisponível para este acesso.' }, { status: 403, headers });
 try {
  if (request.method === 'POST') {
   validateOrigin(request, true);
   const body = await readInput(request, input);
   if (body.action === 'send') sendChat(actor, body.recipient, body.body, body.clientId);
   else readChat(actor, body.conversation, body.through);
   return Response.json({ ok: true }, { headers });
  }
  const url = new URL(request.url);
  const before = Number(url.searchParams.get('before') || 0);
  if (!Number.isSafeInteger(before) || before < 0) throw Error('Página inválida.');
  return Response.json(chatSnapshot(actor, url.searchParams.get('conversation') || 'general', before), { headers });
 } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Falha no chat.' }, { status: 400, headers }); }
}
export const GET = handle;
export const POST = handle;
