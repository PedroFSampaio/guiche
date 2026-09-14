import { isReserveAdmin } from './reserve-admin.ts';
import { SERVICES, dayKey, isPending, type State, type Member } from './queue.ts';
export function visibleQueue(state: State, me: Member, requestedDay: string | null) {
    const today = dayKey();
    const history = me.role === 'admin' || Object.hasOwn(SERVICES, me.role);
    if (!history && requestedDay && requestedDay !== today)
        throw Error('Histórico não disponível para este perfil.');
    const day = history ? requestedDay || today : today;
    const visible = state.patients.filter(p => ['admin', 'reception', 'tv'].includes(me.role) || p.service === me.role);
    const patients = visible.filter(p => p.day === day || (isPending(p) && p.owner === me.email));
    const tv = me.role === 'tv';
    return {
        me, day: today,
        dates: history ? [...new Set(visible.map(p => p.day))].sort().reverse() : [],
        patients: tv ? patients.filter(p => p.day === today && p.status === 'waiting').sort((a, b) => Number(b.priority) - Number(a.priority) || a.queued - b.queued).map(p => ({ id: p.id, code: p.code, service: p.service, status: p.status })) : patients,
        announcements: state.announcements.filter(a => a.day === day && (['admin', 'tv'].includes(me.role) || a.service === me.role)).map(a => tv ? { id: a.id, name: a.name, code: a.code, service: a.service, location: a.location, created: a.created, started: a.started, ended: a.ended } : a),
        members: me.role === 'admin' ? state.members.filter(m => !isReserveAdmin(m)) : undefined,
    };
}
