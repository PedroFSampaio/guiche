import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {emptyState,mutate,dayKey,isPending,type State} from '../../../lib/queue';
export const dynamic='force-dynamic';
function database(){if(!env.DB)throw Error('Banco de dados indisponível.');return env.DB}
// One versioned metadata record serializes mutations; patient and announcement
// records are stored separately to avoid an ever-growing SQLite value.
async function read(){
 const db=database();await db.prepare('INSERT OR IGNORE INTO unit_state (id,version,data) VALUES (?,0,?)').bind('unit',JSON.stringify({members:[],counters:{}})).run();
 const result=await db.batch([db.prepare('SELECT version,data FROM unit_state WHERE id=?').bind('unit'),db.prepare('SELECT id,data FROM unit_state WHERE id<>?').bind('unit')]);
 const root=result[0].results[0] as unknown as {version:number;data:string};if(!root)throw Error('Não foi possível carregar a unidade.');
 const meta=JSON.parse(root.data);const state:State={members:meta.members??[],counters:meta.counters??{},patients:meta.patients??[],announcements:meta.announcements??[]};const previous=new Map<string,string>();
 for(const r of result[1].results as unknown as {id:string;data:string}[]){previous.set(r.id,r.data);if(r.id.startsWith('p:'))state.patients.push(JSON.parse(r.data));else if(r.id.startsWith('a:'))state.announcements.push(JSON.parse(r.data))}
 state.patients.sort((a,b)=>a.created-b.created);state.announcements.sort((a,b)=>a.created-b.created);
 return {version:root.version,state,previous};
}
async function save(state:State,version:number,previous:Map<string,string>){
 const db=database();const token=crypto.randomUUID();const statements=[db.prepare('UPDATE unit_state SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify({members:state.members,counters:state.counters,writeToken:token}),'unit',version)];
 const rows=[...state.patients.map(p=>({id:'p:'+p.id,data:JSON.stringify(p)})),...state.announcements.map(a=>({id:'a:'+a.id,data:JSON.stringify(a)}))];
 for(const r of rows)if(previous.get(r.id)!==r.data)statements.push(db.prepare("INSERT INTO unit_state (id,version,data) SELECT ?,0,? WHERE EXISTS (SELECT 1 FROM unit_state WHERE id='unit' AND json_extract(data,'$.writeToken')=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=unit_state.version+1").bind(r.id,r.data,token));
 const result=await db.batch(statements);return result[0].meta.changes===1;
}
async function identity(){const user=await getChatGPTUser();if(!user)throw Error('Entre na sua conta para acessar a unidade.');return {...user,email:user.email.toLowerCase()}}
function fail(e:unknown){const message=e instanceof Error?e.message:'Falha inesperada.';return Response.json({error:message},{status:400,headers:{'Cache-Control':'no-store'}})}
export async function GET(request:Request){try{const user=await identity();const {state}=await read();const me=state.members.find(m=>m.email===user.email);if(!me)return Response.json({setup:state.members.length===0,email:user.email,denied:state.members.length>0},{headers:{'Cache-Control':'no-store'}});const url=new URL(request.url);const day=url.searchParams.get('day')||dayKey();const visible=state.patients.filter(p=>me.role==='admin'||me.role==='reception'||me.role==='tv'||p.service===me.role);const patients=visible.filter(p=>p.day===day||(isPending(p)&&p.owner===me.email));const tv=me.role==='tv';return Response.json({me,day:dayKey(),dates:[...new Set(visible.map(p=>p.day))].sort().reverse(),patients:tv?patients.map(p=>({id:p.id,code:p.code,service:p.service,status:p.status,created:p.created,priority:p.priority})):patients,announcements:state.announcements.filter(a=>a.day===day&&(me.role==='admin'||me.role==='reception'||tv||a.service===me.role)),members:me.role==='admin'?state.members:undefined},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw Error('Origem da solicitação não autorizada.');const user=await identity();const body:any=await request.json();if(!body||typeof body.action!=='string')throw Error('Solicitação inválida.');for(let attempt=0;attempt<8;attempt++){const {state,version,previous}=await read();let result:unknown;const me=state.members.find(m=>m.email===user.email);if(body.action==='setup'){if(state.members.length)throw Error('A unidade já foi configurada.');state.members.push({email:user.email,name:user.displayName,role:'admin',location:''});result={ok:true}}else{if(!me)throw Error('Seu acesso ainda não foi autorizado.');result=mutate(state,me,body)}if(await save(state,version,previous))return Response.json({result},{headers:{'Cache-Control':'no-store'}})}throw Error('Outra operação está em andamento. Tente novamente.')}catch(e){return fail(e)}}
