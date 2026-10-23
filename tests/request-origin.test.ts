import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrigin, requestHostAllowed, requestUsesHttps } from '../lib/request-origin.ts';
const request = (origin: string, host = '127.0.0.1:5173') => new Request('http://localhost:5173/api/queue', { headers: { origin, host } });

test('domínio da prefeitura funciona atrás do proxy com origem Docker interna ou sem variável', () => {
  const previous = process.env.GUICHE_PUBLIC_ORIGIN;
  try {
    for (const configured of [undefined, 'https://172.20.0.15', 'https://outro.exemplo.gov.br']) {
      if (configured === undefined) delete process.env.GUICHE_PUBLIC_ORIGIN;
      else process.env.GUICHE_PUBLIC_ORIGIN = configured;
      const valid = request('https://chat.saomanuel.sp.gov.br', 'chat.saomanuel.sp.gov.br');
      assert.doesNotThrow(() => validateOrigin(valid, true));
      assert.equal(requestHostAllowed(valid.headers), true);
      assert.equal(requestUsesHttps(valid.headers), true);
      const readHeaders = new Headers({ host: 'chat.saomanuel.sp.gov.br' });
      assert.equal(requestHostAllowed(readHeaders), true);
      assert.doesNotThrow(() => validateOrigin(new Request('http://172.20.0.15:3000/api/auth', { headers: readHeaders }), true));
      for (const origin of ['https://evil.example', 'null', 'http://chat.saomanuel.sp.gov.br', 'https://chat.saomanuel.sp.gov.br:5443']) {
        assert.throws(() => validateOrigin(request(origin, 'chat.saomanuel.sp.gov.br'), true));
      }
      assert.throws(() => validateOrigin(request('https://chat.saomanuel.sp.gov.br', 'evil.example'), true));
      assert.throws(() => validateOrigin(request('https://chat.saomanuel.sp.gov.br', '172.20.0.15'), true));
      assert.equal(requestHostAllowed(new Headers({ host: 'evil.example', 'x-forwarded-host': 'chat.saomanuel.sp.gov.br', 'x-forwarded-proto': 'https' })), false);
      if (configured) {
        const other = request(configured, new URL(configured).host);
        assert.doesNotThrow(() => validateOrigin(other, true));
        assert.equal(requestUsesHttps(other.headers), true);
      } else {
        assert.equal(requestUsesHttps(request('http://127.0.0.1:5173').headers), false);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.GUICHE_PUBLIC_ORIGIN;
    else process.env.GUICHE_PUBLIC_ORIGIN = previous;
  }
});
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
