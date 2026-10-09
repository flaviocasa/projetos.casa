import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { instructions } from './knowledge.ts';
export type Message = {role:'user'|'assistant';content:string};
export type Config = { enabled:boolean; apiKey:string; budgetApproved:boolean; knowledgeApproved:boolean; dailyMicros:number; monthlyMicros:number; totalMicros:number; rateValidUntil:number; origin:string; killFile:string };
export const MODEL='gpt-4.1-mini-2025-04-14';
export const LIMITS=Object.freeze({maxBodyBytes:22000,maxHistoryBytes:12000,maxMessageBytes:4000,maxMessages:12,maxOutputTokens:800,timeoutMs:25000,maxConcurrency:2,maxRequestsPerMinute:10,requestReserveMicros:20000});
// Text-only fixed snapshot. Reserve $0.02 per attempted generation, never refund uncertain outcomes.
// Verified 2026-10-09: standard input $0.40/M, output $1.60/M. No tools or images.
// Byte-bound input + 8192 token framing margin stays below this reserve. Recheck pricing before enablement.
export class AppError extends Error { status:number; code:string; constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code} }
export function active(c:Config,now=Date.now()){return c.enabled&&!!c.apiKey&&c.budgetApproved&&c.knowledgeApproved&&c.dailyMicros>=LIMITS.requestReserveMicros&&c.monthlyMicros>=LIMITS.requestReserveMicros&&c.totalMicros>=LIMITS.requestReserveMicros&&Number.isFinite(c.rateValidUntil)&&c.rateValidUntil>now&&c.rateValidUntil<=now+31*86400000&&!existsSync(c.killFile)}
export function validate(body:unknown):Message[]{
 const b=body as {consent?:unknown;messages?:unknown};
 if(!b||b.consent!=='openai-processing-v1')throw new AppError(400,'consent_required','Autorize o processamento pela OpenAI antes de continuar.');
 if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>LIMITS.maxMessages)throw new AppError(400,'invalid_history','Conversa fora do limite. Comece uma nova conversa.');
 let total=0; const messages:Message[]=[];
 for(let i=0;i<b.messages.length;i++){const m=b.messages[i];if(!m||m.role!==(i%2===0?'user':'assistant')||typeof m.content!=='string'||!m.content.trim()||Buffer.byteLength(m.content)>LIMITS.maxMessageBytes)throw new AppError(400,'invalid_message','Mensagem inválida ou longa demais.');total+=Buffer.byteLength(m.content);messages.push({role:m.role,content:m.content.trim()})}
 if(messages.at(-1)?.role!=='user'||total>LIMITS.maxHistoryBytes)throw new AppError(400,'history_limit','Conversa longa demais. Comece uma nova conversa.');
 return messages;
}
function validCounter(scope:string,r:{micros:number;period:string}|undefined):boolean {
 if(!r||!Number.isSafeInteger(r.micros)||r.micros<0||typeof r.period!=='string')return false;
 if(scope==='total')return r.period==='*';
 if(r.period==='')return r.micros===0;
 if(scope==='month')return /^month:\d{4}-(0[1-9]|1[0-2])$/.test(r.period);
 if(scope==='day'&&/^day:\d{4}-\d{2}-\d{2}$/.test(r.period)){const day=r.period.slice(4),time=Date.parse(day);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===day}
 return false;
}
export class BudgetGate {
 db:DatabaseSync; path:string;
 constructor(path:string,initialize=false){
  this.path=path;const found=existsSync(path);
  if(!found&&!initialize)throw new AppError(503,'budget_storage_missing','Contador de uso indisponível. Atendimento pausado.');
  this.db=new DatabaseSync(path);this.db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  if(!found&&initialize)this.db.exec(`BEGIN IMMEDIATE; CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO metadata VALUES ('schema','portal-budget-v1'); CREATE TABLE budget (scope TEXT PRIMARY KEY, micros INTEGER NOT NULL CHECK(micros>=0), period TEXT NOT NULL); INSERT INTO budget VALUES ('total',0,'*'),('day',0,''),('month',0,''); CREATE TABLE calls(id TEXT PRIMARY KEY, started INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1))); COMMIT;`);
  try{const meta=this.db.prepare("SELECT value FROM metadata WHERE key='schema'").get() as {value:string}|undefined;if(meta?.value!=='portal-budget-v1')throw Error('invalid schema');const rows=this.db.prepare('SELECT scope,micros,period FROM budget').all();if(rows.length!==3||!['total','day','month'].every(scope=>rows.some(r=>r.scope===scope&&validCounter(scope,r as unknown as {micros:number;period:string}))))throw Error('invalid ledger');this.db.prepare('SELECT started,active FROM calls LIMIT 1').all()}catch{this.db.close();throw new AppError(503,'budget_storage_invalid','Contador de uso inválido. Atendimento pausado.')}
 }
 reserve(c:Config,now=Date.now()):string{
  if(!existsSync(this.path))throw new AppError(503,'budget_storage_missing','Contador de uso indisponível. Atendimento pausado.');
  const id=randomUUID(),date=new Date(now).toISOString(),day='day:'+date.slice(0,10),month='month:'+date.slice(0,7),fee=LIMITS.requestReserveMicros;
  this.db.exec('BEGIN IMMEDIATE');try{
   this.db.prepare('DELETE FROM calls WHERE started < ?').run(now-86400000);
   // Lease outlives the 25s HTTP timeout. Stale process exits do not refund budget.
   this.db.prepare('UPDATE calls SET active=0 WHERE started < ?').run(now-120000);
   const running=this.db.prepare('SELECT COUNT(*) AS n FROM calls WHERE active=1').get() as {n:number};
   if(running.n>=LIMITS.maxConcurrency)throw new AppError(429,'busy','A assistente está ocupada. Tente novamente em instantes.');
   const recent=this.db.prepare('SELECT COUNT(*) AS n FROM calls WHERE started >= ?').get(now-60000) as {n:number};
   if(recent.n>=LIMITS.maxRequestsPerMinute)throw new AppError(429,'rate_limit','Muitas mensagens neste momento. Aguarde um minuto.');
   for(const [scope,period,limit]of [['day',day,c.dailyMicros],['month',month,c.monthlyMicros],['total','*',c.totalMicros]] as const){
    const r=this.db.prepare('SELECT micros,period FROM budget WHERE scope=?').get(scope) as {micros:number;period:string}|undefined;
    if(!r||!validCounter(scope,r))throw new AppError(503,'budget_storage_invalid','Contador de uso inválido. Atendimento pausado.');
    if(r.period&&period<r.period)throw new AppError(503,'clock_reversed','Período de uso inconsistente. Atendimento pausado.');
    const prior=r.period===period?r.micros:0;
    if(prior+fee>limit)throw new AppError(429,'budget_limit','O limite de uso da assistente foi atingido. O atendimento por IA está pausado.');
    this.db.prepare('UPDATE budget SET micros=?,period=? WHERE scope=?').run(prior+fee,period,scope)
   }
   this.db.prepare('INSERT INTO calls(id,started,active) VALUES (?,?,1)').run(id,now);this.db.exec('COMMIT');return id;
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 finish(id:string){this.db.prepare('UPDATE calls SET active=0 WHERE id=?').run(id)}
 close(){this.db.close()}
}
export async function respond(body:unknown,c:Config,gate:BudgetGate,fetcher:typeof fetch=fetch):Promise<{reply:string;kind:'ai'}>{
 if(!active(c))throw new AppError(503,'not_configured','A IA ainda não está disponível. Não há resposta simulada neste chat.');
 const messages=validate(body);
 const payload={model:MODEL,instructions,input:messages,max_output_tokens:LIMITS.maxOutputTokens,store:false,tools:[]};
 const conservativeInputBound=Buffer.byteLength(instructions)+messages.reduce((n,m)=>n+Buffer.byteLength(m.content),0)+8192;
 if(Math.ceil(conservativeInputBound*0.4+LIMITS.maxOutputTokens*1.6)>LIMITS.requestReserveMicros)throw new AppError(503,'cost_bound','Configuração de limite requer revisão.');
 const reservation=gate.reserve(c);
 try{
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(LIMITS.timeoutMs)});
  if(!response.ok)throw new AppError(502,'provider_error','A OpenAI não concluiu a resposta. Nenhum pedido foi enviado ao Flávio.');
  const data=await response.json() as {status?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string;refusal?:string}>}>};
  if(data.status!=='completed')throw new AppError(502,'incomplete_response','A resposta ficou incompleta. Tente uma pergunta mais curta.');
  const reply=(data.output??[]).filter(x=>x.type==='message').flatMap(x=>x.content??[]).map(x=>x.type==='output_text'?x.text:x.type==='refusal'?x.refusal:'').filter(Boolean).join('\n');
  if(!reply||reply.length>12000)throw new AppError(502,'invalid_response','Não foi possível obter uma resposta válida.');
  return {reply,kind:'ai'};
 }catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'connection_error','A conexão com a IA falhou. Nenhuma resposta foi inventada.');}
 finally{gate.finish(reservation)}
}
export function moneyMicros(v:string|undefined){if(!v||!/^\d+(\.\d{1,6})?$/.test(v))return 0;const n=Math.round(Number(v)*1e6);return Number.isSafeInteger(n)&&n<=1000e6?n:0}
