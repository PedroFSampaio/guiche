"use client";
import type { AuthStatus } from '../lib/client-types';
import { useCallback, useEffect, useRef, useState } from 'react';
export function useTelevisionAudio() {
    const preferences = useRef({ voice: false, chime: false, confirmation: 0 });
    const context = useRef<AudioContext | null>(null);
    const ready = useRef(false);
    const sound = useRef<AudioBuffer | null>(null);
    const playing = useRef<Promise<boolean> | null>(null);
    const [blocked, setBlocked] = useState(false), [error, setError] = useState('');
    const beep = useCallback(async () => {
        if (playing.current)
            return playing.current;
        const play = async () => {
            try {
                if (!('AudioContext' in window))
                    throw Error('Este navegador não oferece suporte ao aviso sonoro.');
                const ctx = context.current ?? (context.current = new AudioContext());
                if (ctx.state !== 'running') {
                    await Promise.race([ctx.resume().catch(() => { }), new Promise(resolve => setTimeout(resolve, 100))]);
                    if (String(ctx.state) !== 'running') {
                        ready.current = false;
                        setBlocked(true);
                        return false;
                    }
                }
                ready.current = true;
                setBlocked(false);
                if (!sound.current) {
                    const response = await fetch('/audio/ding-dong.wav', { signal: AbortSignal.timeout(5000) });
                    if (!response.ok)
                        throw Error('Não foi possível carregar o ding-dong.');
                    sound.current = await ctx.decodeAudioData(await response.arrayBuffer());
                }
                if (ctx.state !== 'running')
                    return false;
                const source = ctx.createBufferSource();
                source.buffer = sound.current;
                source.connect(ctx.destination);
                const completed = await new Promise<boolean>(resolve => {
                    let ended = false;
                    const finish = (ok: boolean) => { if (ended)
                        return; ended = true; clearTimeout(timeout); source.disconnect(); resolve(ok); };
                    const timeout = setTimeout(() => { try {
                        source.stop();
                    }
                    catch { } finish(false); }, (source.buffer!.duration + 2) * 1000);
                    source.onended = () => finish(ctx.state === 'running');
                    source.start();
                });
                if (completed)
                    setError('');
                return completed;
            }
            catch (e) {
                setError(e instanceof Error ? e.message : 'Aviso sonoro indisponível.');
                return false;
            }
        };
        playing.current = play();
        try {
            return await playing.current;
        }
        finally {
            playing.current = null;
        }
    }, []);
    const unlock = useCallback(async () => {
        try {
            const ctx = context.current ?? (context.current = new AudioContext());
            await ctx.resume();
            ready.current = ctx.state === 'running';
            setBlocked(!ready.current);
            if ('speechSynthesis' in window) {
                speechSynthesis.getVoices();
                speechSynthesis.speak(new SpeechSynthesisUtterance(''));
            }
        }
        catch {
            setBlocked(true);
        }
    }, []);
    useEffect(() => {
        let stopped = false, running = false;
        let confirmed = Number(sessionStorage.getItem('guiche-audio-confirmed') ?? 0);
        const poll = async () => {
            if (running)
                return;
            running = true;
            try {
                const r = await fetch('/api/auth', { signal: AbortSignal.timeout(10000) });
                const j = await r.json() as AuthStatus;
                if (stopped || !j.audio)
                    return;
                if (preferences.current.voice && !j.audio.voice)
                    window.speechSynthesis?.cancel();
                preferences.current = j.audio;
                if ((j.audio.voice || j.audio.chime) && (j.audio.confirmation !== confirmed || !ready.current)) {
                    if (await beep()) {
                        confirmed = j.audio.confirmation;
                        sessionStorage.setItem('guiche-audio-confirmed', String(confirmed));
                    }
                }
            }
            catch { /* The queue connection indicator reports network failures. */ }
            finally {
                running = false;
            }
        };
        void poll();
        const timer = setInterval(() => void poll(), 1500);
        return () => { stopped = true; clearInterval(timer); ready.current = false; const old = context.current; context.current = null; void old?.close().catch(() => { }); };
    }, [beep]);
    return { preferences, ready, blocked, unlock, beep, error };
}
