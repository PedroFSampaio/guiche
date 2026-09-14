import type { Member } from './queue.ts';
// Immutable identity of the original administrator; protection does not depend
// on an editable display name or username.
export const RESERVE_ADMIN_ID = 'admin@guiche.local';
export const isReserveAdmin = (member: Pick<Member, 'email'>) => member.email === RESERVE_ADMIN_ID;
