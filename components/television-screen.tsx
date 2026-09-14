"use client";
import { Heart, HeartPulse, Cross, Volume2, Clock3, Pill, Tablets, FileText, ChevronRight } from 'lucide-react';
import type { Announcement, Patient, Service } from '../lib/queue';
const labels: Record<Service, string> = { AC: 'Alto custo', RM: 'Controlados', ED: 'Documentos' };
const icons = { AC: Tablets, RM: Pill, ED: FileText };
export function TelevisionScreen({ current, recent, waiting, enabled, onEnable, now, warning }: {
    current: Announcement | null;
    recent: Announcement[];
    waiting: Patient[];
    enabled: boolean;
    onEnable: () => void;
    now: number;
    warning?: string;
}) {
    const theme = current?.service ?? recent[0]?.service ?? 'ED';
    const clock = new Date(now);
    return <div className={'tv-display tv-theme-' + theme}>
  <div className="display-top">
   <div className="display-brand"><div className="display-emblem"><Cross /><Heart fill="currentColor"/></div><div><strong>GUICHÊ</strong><span>SAÚDE EM BOAS MÃOS</span></div></div>
   {enabled ? <div className="display-audio-status"><HeartPulse /><span>Cuidando de você,<br />a cada atendimento.</span></div> : <button className="display-audio" onClick={onEnable}><Volume2 /><span>Permitir áudio nesta televisão</span></button>}
   <div className="display-motto">CUIDAR DE VOCÊ<br />É A NOSSA PRIORIDADE</div>
   <div className="display-clock"><span>{clock.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}</span><time>{clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</time></div>
  </div>
  {warning && <div className="display-warning" role="alert">{warning}</div>}
  <div className="display-main">
   <section className={'display-hero' + (current ? ' is-calling' : '')} aria-live="polite" aria-atomic="true">
    <div className="hero-content"><p className="hero-eyebrow">{current ? 'CHAMANDO AGORA' : 'AGUARDE SUA CHAMADA'}</p><HeartPulse className="hero-heart" strokeWidth={1.8}/>
    {current ? <><div className="hero-ticket">{current.code} · {labels[current.service]}</div><h1>{current.name}</h1><p className="hero-location">{current.location}</p></> : <><h1>Bem-vindo.</h1><p className="hero-subtitle">Fique atento ao seu nome e ao local indicado na tela.</p></>}</div>
    <div className="hero-caption"><i />ATENDIMENTO COM RESPEITO,<br />SAÚDE PARA TODOS.</div>
   </section>
   <section className="display-recent"><div className="recent-heading"><Clock3 /><h2>Últimas chamadas</h2><span>Mais recentes primeiro</span></div>
    <div className="recent-list">{recent.map(a => <div className="display-recent-row" key={a.id}><strong>{a.name}</strong><span className={'display-service' + (a.service === theme ? ' is-current' : '')}>{labels[a.service]}</span><time>{new Date(a.started ?? a.created).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</time></div>)}
    {!recent.length && <div className="recent-empty"><Clock3 /><p>As chamadas aparecerão aqui.</p></div>}</div>
   </section>
  </div>
  <div className="display-queues">{(['AC', 'RM', 'ED'] as Service[]).map(service => { const patients = waiting.filter(p => p.service === service); const Icon = icons[service]; return <section className="display-queue" key={service}><div className="queue-icon"><Icon strokeWidth={1.6}/></div><div className="queue-content"><h2>{labels[service]}</h2><p><strong>{patients.length}</strong><span>aguardando</span></p>{patients[0] && <div className="queue-next"><span>PRÓXIMO:</span><b>{patients[0].name.trim().split(/\s+/)[0]}</b></div>}</div><ChevronRight className="queue-chevron"/></section>; })}</div>
  <footer className="display-footer"><span>ORGANIZAÇÃO HOJE, MAIS TEMPO PARA O QUE REALMENTE IMPORTA.</span><i /><span>SUA SAÚDE, NOSSO COMPROMISSO</span><Heart /></footer>
 </div>;
}
