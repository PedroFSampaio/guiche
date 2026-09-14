import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configurePatientVoice} from '../lib/patient-voice.ts';
const voice=(name:string,lang:string,localService=true)=>({name,lang,localService} as SpeechSynthesisVoice);
test('prioriza voz brasileira local e mantém ritmo moderado',()=>{
 const utterance={} as SpeechSynthesisUtterance;
 assert.equal(configurePatientVoice(utterance,[voice('Remote Natural','pt-BR',false),voice('Helena','pt-BR')]),true);
 assert.equal(utterance.voice?.name,'Helena');assert.equal(utterance.rate,.92);
});
test('não transmite nomes para voz remota como fallback',()=>{
 const utterance={} as SpeechSynthesisUtterance;
 assert.equal(configurePatientVoice(utterance,[voice('Remote','pt-BR',false)]),false);
 assert.equal(utterance.voice,undefined);
});
