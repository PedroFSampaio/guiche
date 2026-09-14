import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrigin } from '../lib/request-origin.ts';
const request = (origin: string, host = '127.0.0.1:5173') => new Request('http://localhost:5173/api/queue', { headers: { origin, host } });
test('origem local usa o host recebido mesmo com URL interna diferente', () => {
  assert.doesNotThrow(() => validateOrigin(request('http://127.0.0.1:5173'), true));
  assert.doesNotThrow(() => validateOrigin(request('http://localhost:5173', 'localhost:5173'), true));
});
test('rejeita sites externos, porta diferente e host externo no modo local', () => {
  for (const origin of ['https://example.com', 'null', 'http://127.0.0.1:5174']) {
    assert.throws(() => validateOrigin(request(origin), true));
  }
  assert.throws(() => validateOrigin(request('http://example.com', 'example.com'), true));
});
test('modo Cloudflare continua validando pela URL da requisição', () => {
  assert.throws(() => validateOrigin(request('http://127.0.0.1:5173')));
  assert.doesNotThrow(() => validateOrigin(request('http://localhost:5173')));
});

test('rede HTTPS usa apenas endereço configurado e não aceita origem falsa',()=>{
 const previous=process.env.GUICHE_PUBLIC_ORIGIN;
 try{
  process.env.GUICHE_PUBLIC_ORIGIN='https://172.20.64.7:5443';
  const make=(origin:string,host='172.20.64.7:5443')=>new Request('http://localhost:5443/api/auth',{headers:{host,origin}});
  assert.doesNotThrow(()=>validateOrigin(make('https://172.20.64.7:5443'),true));
  assert.throws(()=>validateOrigin(make('http://172.20.64.7:5443'),true));
  assert.throws(()=>validateOrigin(make('https://evil.example'),true));
  assert.throws(()=>validateOrigin(make('https://172.20.64.7:5443','evil.example'),true));
 }finally{if(previous===undefined)delete process.env.GUICHE_PUBLIC_ORIGIN;else process.env.GUICHE_PUBLIC_ORIGIN=previous;}
});
