import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureDefaultAdmin,login,needsBootstrap} from '../lib/local-auth.ts';
process.env.GUICHE_ADMIN_USER='admin';
process.env.GUICHE_ADMIN_PASSWORD='guiche1234';
test('cria o admin padrão somente quando não há credenciais',()=>{
 assert.equal(needsBootstrap(),true);
 assert.equal(ensureDefaultAdmin(),true);
 assert.equal(needsBootstrap(),false);
 assert.equal(ensureDefaultAdmin(),false);
 assert.match(String(login('admin','guiche1234')),/^[a-f0-9]{64}$/);
});
