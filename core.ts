import { instructions } from './knowledge.ts';
export type Message = {role:'user'|'assistant';content:string};
export type Config = { enabled:boolean; apiKey:string; knowledgeApproved:boolean; origin:string };
export const MODEL='gpt-4.1-mini-2025-04-14';
export const LIMITS=Object.freeze({maxBodyBytes:22000,maxHistoryBytes:12000,maxMessageBytes:4000,maxMessages:12,maxOutputTokens:800,timeoutMs:25000,maxConcurrency:2,maxRequestsPerMinute:10,startupDelayMs:60000});
export class AppError extends Error { status:number; code:string; constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code} }
export function active(c:Config){return c.enabled&&!!c.apiKey&&c.knowledgeApproved&&/^https?:\/\//.test(c.origin)}
export function validate(body:unknown):Message[]{
 const b=body as {consent?:unknown;messages?:unknown};
 if(!b||b.consent!=='openai-processing-v1')throw new AppError(400,'consent_required','Autorize o processamento pela OpenAI antes de continuar.');
 if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>LIMITS.maxMessages)throw new AppError(400,'invalid_history','Conversa fora do limite. Comece uma nova conversa.');
 let total=0; const messages:Message[]=[];
 for(let i=0;i<b.messages.length;i++){const m=b.messages[i];if(!m||m.role!==(i%2===0?'user':'assistant')||typeof m.content!=='string'||!m.content.trim()||Buffer.byteLength(m.content)>LIMITS.maxMessageBytes)throw new AppError(400,'invalid_message','Mensagem inválida ou longa demais.');total+=Buffer.byteLength(m.content);messages.push({role:m.role,content:m.content.trim()})}
 if(messages.at(-1)?.role!=='user'||total>LIMITS.maxHistoryBytes)throw new AppError(400,'history_limit','Conversa longa demais. Comece uma nova conversa.');
 return messages;
}
// Single-process abuse protection, not accounting or a spending guarantee.
// Monotonic time avoids wall-clock jumps. A fresh process waits a full rate window.
export class AbuseGate {
 private recent:number[]=[]; private running=new Set<number>(); private nextId=0;
 private clock:()=>number; private readyAt:number;
 constructor(clock:()=>number=()=>performance.now()){this.clock=clock;this.readyAt=clock()+LIMITS.startupDelayMs}
 ready(){return this.clock()>=this.readyAt}
 reserve():number{
  const now=this.clock();
  if(now<this.readyAt)throw new AppError(503,'warming_up','A assistente está iniciando. Aguarde um minuto.');
  this.recent=this.recent.filter(t=>t>now-60000);
  if(this.running.size>=LIMITS.maxConcurrency)throw new AppError(429,'busy','A assistente está ocupada. Tente novamente em instantes.');
  if(this.recent.length>=LIMITS.maxRequestsPerMinute)throw new AppError(429,'rate_limit','Muitas mensagens neste momento. Aguarde um minuto.');
  const id=++this.nextId;this.recent.push(now);this.running.add(id);return id;
 }
 finish(id:number){this.running.delete(id)}
}
export async function respond(body:unknown,c:Config,gate:AbuseGate,fetcher:typeof fetch=fetch):Promise<{reply:string;kind:'ai'}>{
 if(!active(c))throw new AppError(503,'not_configured','A IA ainda não está disponível. Não há resposta simulada neste chat.');
 const messages=validate(body);
 const payload={model:MODEL,instructions,input:messages,max_output_tokens:LIMITS.maxOutputTokens,store:false,tools:[]};
 const reservation=gate.reserve();
 try{
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(LIMITS.timeoutMs)});
  if(!response.ok){let code='unclassified';try{const error=await response.json() as {error?:{code?:unknown}};const candidate=error.error?.code;if(typeof candidate==='string'&&['invalid_api_key','insufficient_quota','model_not_found','rate_limit_exceeded','permission_denied'].includes(candidate))code=candidate}catch{}console.warn('OpenAI request rejected: HTTP '+response.status+' code='+code);throw new AppError(502,'provider_error','A OpenAI não concluiu a resposta. Nenhum pedido foi enviado ao Flávio.');}
  const data=await response.json() as {status?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string;refusal?:string}>}>};
  if(data.status!=='completed')throw new AppError(502,'incomplete_response','A resposta ficou incompleta. Tente uma pergunta mais curta.');
  const reply=(data.output??[]).filter(x=>x.type==='message').flatMap(x=>x.content??[]).map(x=>x.type==='output_text'?x.text:x.type==='refusal'?x.refusal:'').filter(Boolean).join('\n');
  if(!reply||Buffer.byteLength(reply)>LIMITS.maxMessageBytes)throw new AppError(502,'invalid_response','Não foi possível obter uma resposta válida.');
  return {reply,kind:'ai'};
 }catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'connection_error','A conexão com a IA falhou. Nenhuma resposta foi inventada.');}
 finally{gate.finish(reservation)}
}
