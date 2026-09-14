import { headers } from 'next/headers';
import { sessionMember } from '../lib/local-auth';
import { requestHostAllowed } from '../lib/request-origin';
export async function getCurrentUser() {
    const requestHeaders = await headers();
    if (!requestHostAllowed(requestHeaders))
        return null;
    const member = sessionMember(requestHeaders.get('cookie'));
    return member ? { userId: member.email, displayName: member.name, email: member.email } : null;
}
