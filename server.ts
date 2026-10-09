import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { active, respond, AbuseGate, AppError, LIMITS } from './core.ts';
import type { Config } from './core.ts';
const root=dirname(fileURLToPath(import.meta.url));
export function configFromEnv(env:NodeJS.ProcessEnv):Config{
 return {enabled:env.API_ENABLED==='true',apiKey:env.OPENAI_API_KEY||'',knowledgeApproved:env.KNOWLEDGE_APPROVED==='true',origin:env.APP_ORIGIN||'http://127.0.0.1:3000'};
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
export function makeHandler(c:Config,gate:AbuseGate,fetcher:typeof fetch=fetch){return async(req:IncomingMessage,res:ServerResponse)=>{
 try{
  const path=(req.url||'/').split('?')[0];
  if(req.method==='GET'&&path==='/api/status'){json(res,200,{available:active(c)&&gate.ready(),starting:active(c)&&!gate.ready(),mode:'ai',consentVersion:'openai-processing-v1'});return}
  const staticFiles:Record<string,[string,string]>={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
  if(req.method==='GET'&&staticFiles[path]){const [file,mime]=staticFiles[path];res.writeHead(200,{...headers,'Content-Type':`${mime}; charset=utf-8`});res.end(readFileSync(resolve(root,'public',file)));return}
  if(path!=='/api/chat'||req.method!=='POST'){json(res,404,{error:'not_found',message:'Página não encontrada.'});return}
  if(req.headers.origin!==c.origin)throw new AppError(403,'origin_rejected','Origem não autorizada.');
  if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new AppError(415,'json_required','Formato inválido.');
  let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>LIMITS.maxBodyBytes)throw new AppError(413,'body_limit','Mensagem longa demais.');chunks.push(chunk)}
  let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new AppError(400,'invalid_json','Formato inválido.')}
  json(res,200,await respond(body,c,gate,fetcher));
 }catch(e){if(e instanceof AppError)json(res,e.status,{error:e.code,message:e.message});else json(res,503,{error:'temporarily_unavailable',message:'Atendimento indisponível. Tente novamente mais tarde.'})}
}}
export function start(){const gate=new AbuseGate();const server=createServer(makeHandler(configFromEnv(process.env),gate));server.requestTimeout=30000;server.headersTimeout=10000;server.maxHeadersCount=30;const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';server.listen(port,host,()=>console.log(`Portal listening on ${host}:${port}; AI requires explicit activation.`));return server}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)start();
