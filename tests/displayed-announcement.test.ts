import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lastDisplayedAnnouncement} from '../lib/displayed-announcement.ts';
import type {Announcement} from '../lib/queue.ts';
const first:Announcement={id:'1',patientId:'p1',name:'Maria',day:'2026-09-14',code:'AC-001',service:'AC',location:'1',owner:'a',created:100,started:200,ended:7200};
test('mantém última chamada encerrada, inclusive após recarregar o painel',()=>{
 assert.equal(lastDisplayedAnnouncement([first],null)?.id,'1');
 assert.equal(lastDisplayedAnnouncement([],first)?.id,'1');
});
test('uma chamada simultânea aguardando anúncio não substitui o paciente',()=>{
 const waiting={...first,id:'2',created:201,started:undefined,ended:undefined};
 assert.equal(lastDisplayedAnnouncement([first,waiting],null)?.id,'1');
 assert.equal(lastDisplayedAnnouncement([first,{...waiting,started:7300}],first)?.id,'2');
});
test('painel permanece na última chamada e ignora ordem de retorno da API',()=>{
 const next={...first,id:'2',created:300,started:7300,ended:14300};
 assert.equal(lastDisplayedAnnouncement([next,first],first)?.id,'2');
 assert.equal(lastDisplayedAnnouncement([],null),null);
});
