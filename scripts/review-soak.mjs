import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5174',times=[],failures=[];
async function call(path,body,cookie){
 const start=performance.now();const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const data=await response.json();times.push(performance.now()-start);
 if(response.status!==200){failures.push({status:response.status,message:data.error});throw Error(data.error)}
 return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const users=await Promise.all(Array.from({length:12},async(_,i)=>({role:['AC','RM','ED'][i%3],cookie:(await call('/api/auth',{action:'login',username:'review-op'+i,password:'ReviewOperator-2026!'})).cookie})));
const start=Date.now();
for(let round=0;round<60;round++){
 const wave=Date.now();
 await Promise.all(users.map(async u=>{const {data}=await call('/api/queue',undefined,u.cookie);assert.ok(data.patients.every(p=>p.service===u.role));}));
 if(round%10===0)console.log('Carga sustentada:',round+1,'de 60 ciclos.');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,2000-(Date.now()-wave))));
}
const sorted=times.sort((a,b)=>a-b);
const report={durationSeconds:Math.round((Date.now()-start)/1000),clients:12,intervalSeconds:2,requests:times.length,failures,latencyMs:{median:Math.round(sorted[Math.floor(sorted.length*.5)]),p95:Math.round(sorted[Math.floor(sorted.length*.95)]),max:Math.round(sorted.at(-1))}};
writeFileSync('outputs/revisao/carga-sustentada.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
