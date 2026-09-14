import type { Announcement } from './queue.ts';
// Only displayed announcements participate; queued calls must wait their turn.
export function lastDisplayedAnnouncement(announcements: Announcement[], local: Announcement | null): Announcement | null {
    return [...announcements, ...(local ? [local] : [])]
        .filter(a => a.started !== undefined)
        .sort((a, b) => b.started! - a.started! || b.created - a.created)[0] ?? null;
}
