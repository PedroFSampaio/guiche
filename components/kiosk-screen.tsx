"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardList, HeartPulse, Pill, Tablet } from 'lucide-react';
import { SERVICES, validBirthDate, type Service } from '../lib/queue';
import { configurePatientVoice } from '../lib/patient-voice';

const activities = [
    { id: 'AC', color: 'Senha rosa', icon: HeartPulse },
    { id: 'RM', color: 'Senha amarela', icon: Pill },
    { id: 'ED', color: 'Senha branca', icon: ClipboardList },
] as const;

function announceService(service: Service) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    try {
        const speech = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(SERVICES[service]);
        utterance.lang = 'pt-BR';
        configurePatientVoice(utterance, speech.getVoices());
        speech.cancel();
        speech.speak(utterance);
    } catch {
        // The confirmation remains available if the device cannot speak.
    }
}

export function KioskScreen({ online, pending = false }: { online: boolean; pending?: boolean }) {
    const [name, setName] = useState('');
    const [birth, setBirth] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [selection, setSelection] = useState<{ name: string; birthDate: string; service: Service } | null>(null);
    const [ticket, setTicket] = useState<{ code: string; service: Service } | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const retry = useRef<{ signature: string; requestId: string } | null>(null);
    const ticketHeading = useRef<HTMLHeadingElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const sending = useRef(false);
    const touchAudio = useRef<AudioContext | null>(null);

    useEffect(() => () => {
        const audio = touchAudio.current;
        touchAudio.current = null;
        if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
    }, []);

    function soundSelection(service: Service) {
        try {
            const audio = touchAudio.current ??= new AudioContext();
            if (audio.state === 'suspended') void audio.resume().catch(() => {});
            const tone = audio.createOscillator();
            const volume = audio.createGain();
            const start = audio.currentTime;
            tone.frequency.value = 740;
            volume.gain.setValueAtTime(0, start);
            volume.gain.linearRampToValueAtTime(.18, start + .012);
            volume.gain.exponentialRampToValueAtTime(.001, start + .11);
            tone.connect(volume);
            volume.connect(audio.destination);
            tone.start(start);
            tone.stop(start + .12);
            tone.onended = () => { tone.disconnect(); volume.disconnect(); };
        } catch {
            // The voice can still work if the browser cannot play the touch tone.
        }
        announceService(service);
    }

    useEffect(() => {
        if (busy || pending || (!ticket && !name && !birth && !error)) return;
        let timer: ReturnType<typeof setTimeout>;
        const restart = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                setName(''); setBirth(''); setError(''); setSelection(null); setTicket(null); retry.current = null;
            }, ticket ? 25_000 : 90_000);
        };
        restart();
        window.addEventListener('pointerdown', restart);
        window.addEventListener('keydown', restart);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('pointerdown', restart);
            window.removeEventListener('keydown', restart);
        };
    }, [birth, busy, error, name, pending, selection, ticket]);

    useEffect(() => { if (ticket) ticketHeading.current?.focus(); }, [ticket]);
    useEffect(() => {
        const modal = dialog.current;
        if (selection && modal && !modal.open) modal.showModal();
        if (!selection && modal?.open) modal.close();
    }, [selection]);

    function selectService(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !online || selection) return;
        const service = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as Service;
        if (!Object.hasOwn(SERVICES, service)) return;
        const fullName = name.trim().replace(/\s+/g, ' ');
        const birthDate = birth.split('/').reverse().join('-');
        if (fullName.split(' ').filter(word => /\p{L}/u.test(word)).length < 2) {
            setError('Informe seu nome completo.');
            form.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
            return;
        }
        if (!validBirthDate(birthDate)) {
            setError('Informe uma data de nascimento válida no formato dia/mês/ano.');
            form.current?.querySelector<HTMLInputElement>('[name="birthDate"]')?.focus();
            return;
        }
        setError('');
        setSelection({ name: fullName, birthDate, service });
    }

    function editSelection() {
        if (sending.current) return;
        setError('');
        setSelection(null);
    }

    async function confirmTicket() {
        if (!selection || sending.current || !online) return;
        const { name: fullName, birthDate, service } = selection;
        sending.current = true;
        setError('');
        setBusy(true);
        try {
            const signature = JSON.stringify([fullName, birthDate, service]);
            if (retry.current?.signature !== signature)
                retry.current = { signature, requestId: crypto.randomUUID() };
            const response = await fetch('/api/queue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ action: 'kioskCheckIn', name: fullName, birthDate, service, requestId: retry.current.requestId }),
            });
            const data = await response.json() as { error?: string; result?: { code?: string } };
            if (!response.ok || !data.result?.code) {
                setError(data.error || 'Não foi possível emitir a senha. Tente novamente ou procure a recepção.');
                return;
            }
            retry.current = null;
            setName(''); setBirth('');
            dialog.current?.close();
            setSelection(null);
            setTicket({ code: data.result.code, service });
        }
        catch {
            setError('Não foi possível confirmar a senha. Toque em Confirmar senha para tentar de novo.');
        }
        finally { sending.current = false; setBusy(false); }
    }

    return <main className="kiosk-screen">
        <div className="kiosk-content">
            <div className="brand"><HeartPulse aria-hidden="true"/> guichê</div>
            <p className="eyebrow">AUTOATENDIMENTO</p>
            {!online && <p className="error" role="alert">Sem conexão. Aguarde ou procure a recepção.</p>}
            {pending ? <section className="card kiosk-result"><Tablet aria-hidden="true"/><h1>Aguardando liberação</h1><p>A recepção ou a administração precisa autorizar este tablet.</p></section>
            : ticket ? <section className="card kiosk-result" aria-live="polite">
                <CheckCircle2 aria-hidden="true"/><h1 ref={ticketHeading} tabIndex={-1}>Sua senha foi emitida</h1>
                <strong className={`kiosk-ticket ${ticket.service}`}>{ticket.code}</strong>
                <p>{SERVICES[ticket.service]}. Aguarde a chamada no painel da TV.</p>
                <button className="primary" onClick={() => setTicket(null)}>Concluir</button>
            </section> : <section className="card kiosk-form">
                <h1>Retire sua senha</h1>
                <p>Preencha seus dados e toque na opção de atendimento que você precisa.</p>
                {error && !selection && <p className="error" role="alert">{error}</p>}
                <form ref={form} onSubmit={selectService} autoComplete="off" onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) e.preventDefault();
                }}>
                    <div className="kiosk-fields">
                        <label>Nome completo<input name="name" required maxLength={160} autoCapitalize="words" autoComplete="off" value={name} onChange={e => setName(e.target.value)} readOnly={busy}/></label>
                        <label>Data de nascimento<input name="birthDate" required inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={birth} readOnly={busy} onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                            setBirth([digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/'));
                        }}/></label>
                    </div>
                    <fieldset disabled={busy || !online}>
                        <legend>Toque para escolher sua senha</legend>
                        <div className="kiosk-options">{activities.map(({ id, color, icon: Icon }) => <button key={id} type="submit" value={id} className={`kiosk-option ${id}`} onClick={() => soundSelection(id)}><Icon aria-hidden="true"/><strong>{SERVICES[id]}</strong><span>{color}</span></button>)}</div>
                    </fieldset>
                </form>
                <p className="muted kiosk-help">Precisa de atendimento prioritário ou de ajuda? Procure a recepção.</p>
                <dialog ref={dialog} className="kiosk-confirm" aria-labelledby="kiosk-confirm-title" onCancel={event => { event.preventDefault(); editSelection(); }}>
                    {selection && <>
                        <h2 id="kiosk-confirm-title">Confira seus dados</h2>
                        <p>Confirme para emitir sua senha e entrar na fila.</p>
                        <dl>
                            <dt>Nome completo</dt><dd>{selection.name}</dd>
                            <dt>Data de nascimento</dt><dd>{selection.birthDate.split('-').reverse().join('/')}</dd>
                            <dt>Atendimento escolhido</dt><dd>{SERVICES[selection.service]} · {activities.find(activity => activity.id === selection.service)?.color}</dd>
                        </dl>
                        {!online && <p className="error" role="alert">Sem conexão. Aguarde para confirmar.</p>}
                        {error && <p className="error" role="alert">{error}</p>}
                        <div className="kiosk-confirm-actions">
                            <button type="button" className="secondary" disabled={busy} onClick={editSelection}>Voltar e corrigir</button>
                            <button type="button" className="primary" disabled={busy || !online} onClick={() => void confirmTicket()}>{busy ? 'Emitindo senha…' : 'Confirmar senha'}</button>
                        </div>
                    </>}
                </dialog>
            </section>}
        </div>
    </main>;
}
