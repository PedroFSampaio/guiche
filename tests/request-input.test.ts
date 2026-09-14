import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queueInput,authInput,readInput} from '../lib/request-input.ts';
test('entradas de API rejeitam permissões extras, tipos incorretos e ações legadas',()=>{
 for(const input of [{action:'member',email:'x'},{action:'create',priority:'false'},{action:'call',role:'admin'},{action:'transfer',service:'admin'},{action:'create',next:['AC','RM','ED']}]){
  assert.equal(queueInput.safeParse(input).success,false);
 }
 assert.equal(queueInput.safeParse({action:'create',name:'Maria',service:'AC',priority:false}).success,true);
 assert.equal(authInput.safeParse({action:'tvAudio',setting:'voice',enabled:'true'}).success,false);
 assert.equal(authInput.safeParse({action:'member',name:'a',username:'abc',password:'12345678',role:'superadmin'}).success,false);
});
test('leitura rejeita JSON inválido e payload excessivo',async()=>{
 await assert.rejects(()=>readInput(new Request('http://localhost',{method:'POST',body:'null'}),queueInput));
 await assert.rejects(()=>readInput(new Request('http://localhost',{method:'POST',body:'x'.repeat(17000)}),queueInput),/tamanho/);
});
