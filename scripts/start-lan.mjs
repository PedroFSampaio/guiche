import {readFileSync} from 'node:fs';
import https from 'node:https';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const config=JSON.parse(readFileSync('.local-data/network.json','utf8'));
const origin=new URL(config.origin);
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Configuração HTTPS inválida.');
const cert=readFileSync(config.certificate),key=readFileSync(config.key);
process.env.GUICHE_PUBLIC_ORIGIN=origin.origin;
process.env.GUICHE_LOCAL='1';
process.env.GUICHE_BUILD='0';
process.env.GUICHE_DIST_DIR=process.env.GUICHE_DIST_DIR||'.next-local';
process.env.NEXT_TELEMETRY_DISABLED='1';
const next=(await import('next')).default;
const app=next({dev:false,dir:root,hostname:origin.hostname,port:Number(origin.port||443)});
await app.prepare();
const handler=app.getRequestHandler();
const server=https.createServer({key,cert,minVersion:'TLSv1.2'},(request,response)=>{
 if(request.headers.host!==origin.host){response.writeHead(403);response.end('Origem não autorizada.');return;}
 response.setHeader('X-Content-Type-Options','nosniff');
 response.setHeader('Referrer-Policy','same-origin');
 Promise.resolve(handler(request,response)).catch(error=>{console.error('Falha na requisição:',error.message);if(!response.headersSent)response.writeHead(500);response.end('Falha inesperada.');});
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(Number(origin.port||443),'0.0.0.0',()=>console.log('Guichê na rede local: '+origin.origin));
server.on('error',error=>{console.error(error.message);process.exitCode=1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref()});
