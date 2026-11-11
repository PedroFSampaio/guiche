import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { emptyState, mutate, validBirthDate, type Member } from '../lib/queue.ts';
import { queueInput } from '../lib/request-input.ts';
import { visibleQueue } from '../lib/visible-queue.ts';
import { canChat } from '../lib/chat.ts';
import { bootstrap, login, saveMember, sessionMember, deviceSessions, controlKiosk, controlTelevision, COOKIE } from '../lib/local-auth.ts';

const kiosk: Member = { email: 'tablet', name: 'Tablet', role: 'kiosk', location: '' };
const reception: Member = { email: 'reception', name: 'Recepção', role: 'reception', location: '' };
const tv: Member = { email: 'tv', name: 'TV', role: 'tv', location: '' };
const now = Date.parse('2026-11-11T01:00:00Z');
const checkIn = { action: 'kioskCheckIn', name: '  Maria   da Silva ', birthDate: '2000-02-29', service: 'AC' as const, requestId: randomUUID() };

test('tablet emite senha na mesma fila e repetir uma solicitação não duplica o cadastro', () => {
    const state = emptyState();
    assert.equal(mutate(state, reception, { action: 'create', name: 'Ana Souza', service: 'AC' }, now)?.code, 'AC-001');
    assert.deepEqual(mutate(state, kiosk, checkIn, now), { code: 'AC-002' });
    const patient = state.patients[1];
    assert.equal(patient.name, 'Maria da Silva');
    assert.equal(patient.birthDate, '2000-02-29');
    assert.equal(patient.priority, false);
    assert.deepEqual(patient.next, []);
    assert.deepEqual(mutate(state, kiosk, checkIn, now + 1), { code: 'AC-002' });
    assert.equal(state.patients.length, 2);
    mutate(state, reception, { action: 'transfer', id: patient.id, service: 'RM' }, now + 2);
    assert.deepEqual(mutate(state, kiosk, checkIn, now + 3), { code: 'AC-002' });
});

test('rejeita datas inválidas, campos extras e acesso do tablet a ações da equipe', () => {
    const state = emptyState();
    for (const date of ['2001-02-29', '2000-04-31', '1900-02-29', '2026-11-11', '29/02/2000']) {
        assert.equal(validBirthDate(date, now), false);
        assert.throws(() => mutate(state, kiosk, { ...checkIn, birthDate: date }, now), /nascimento/);
    }
    assert.throws(() => mutate(state, kiosk, { ...checkIn, name: 'Maria' }, now), /nome completo/);
    assert.throws(() => mutate(state, reception, checkIn, now), /exclusivo do tablet/);
    assert.throws(() => mutate(state, kiosk, { ...checkIn, action: 'create' }, now), /restrito/);
    assert.throws(() => mutate(state, kiosk, { action: 'claimAnnouncement', lease: 'test' }, now), /restrito/);
    assert.equal(queueInput.safeParse({ ...checkIn, priority: true }).success, false);
    assert.equal(queueInput.safeParse({ ...checkIn, next: ['RM'] }).success, false);
    assert.throws(() => visibleQueue(state, kiosk, null), /restrito/);
    assert.equal(canChat(kiosk), false);
    mutate(state, kiosk, checkIn);
    assert.equal(Object.hasOwn(visibleQueue(state, tv, null).patients[0], 'birthDate'), false);
    assert.equal(Object.hasOwn(visibleQueue(state, reception, null).patients[0], 'kioskReceipt'), false);
});

test('tablet exige liberação própria e pode ser desconectado pela recepção', () => {
    const admin = sessionMember(`${COOKIE}=${bootstrap({ username: 'test-admin', password: 'senha-de-teste-123' })}`)!;
    saveMember(admin, { name: 'Tablet', username: 'tablet', password: 'senha-tablet-123', role: 'kiosk' });
    const cookie = `${COOKIE}=${login('tablet', 'senha-tablet-123')}`;
    const session = deviceSessions(reception, 'kiosk')[0];
    assert.equal(sessionMember(cookie), null);
    assert.equal(sessionMember(cookie, true)?.role, 'kiosk');
    assert.throws(() => controlKiosk(kiosk, String(session.id), true), /restrito/);
    assert.throws(() => controlTelevision(reception, String(session.id), 'approveTV'), /não encontrada/);
    controlKiosk(reception, String(session.id), true);
    assert.equal(sessionMember(cookie)?.role, 'kiosk');
    controlKiosk(reception, String(session.id), false);
    assert.equal(sessionMember(cookie, true), null);
});
