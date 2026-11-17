import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import vm from'node:vm';
class El{children:El[]=[];className='';textContent='';value='';checked=false;disabled=false;open=false;focused=false;onclick:any;onchange:any;onsubmit:any;onkeydown:any;parent:El|null=null;appendChild(x:El){x.parent=this;this.children.push(x)}replaceChildren(){this.children=[]}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}focus(){this.focused=true} }
const tick=()=>new Promise(r=>setImmediate(r));
function setup(available=true,reply?:()=>Promise<Response>,starting=false){const ids:Record<string,El>={};for(const id of ['input','conversation','consent','status-badge','notice','form','reset','choices','chat-cta','atendimento','chat-summary'])ids[id]=new El;const send=new El;let calls:any[]=[],timers:Array<()=>void>=[];const document={getElementById:(id:string)=>ids[id],querySelector:()=>send,querySelectorAll:()=>ids.choices.children,createElement:()=>new El};const fetch=async(url:string,init?:any)=>{calls.push({url,init});if(url==='/api/status')return new Response(JSON.stringify({available,starting}));return reply?reply():new Response(JSON.stringify({kind:'ai',reply:'Resposta do mock de teste.'}))};vm.runInNewContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),{document,fetch,AbortController,TextEncoder,setTimeout:(f:()=>void)=>{timers.push(f);return f},clearTimeout:(f:()=>void)=>{const i=timers.indexOf(f);if(i>=0)timers.splice(i,1)}});return{ids,send,calls,timers}}
test('UI does not send conversation before consent, and disabled state is honest',async()=>{const x=setup();await tick();assert(x.send.disabled);x.ids.input.value='Olá';x.ids.form.onsubmit({preventDefault(){}});await tick();assert.equal(x.calls.length,1);assert(x.ids.notice.textContent.includes('Autorize'));const y=setup(false);await tick();assert(y.ids.input.disabled);assert(y.ids.notice.textContent.includes('não usa respostas simuladas'))});
test('consented chat sends bounded history, safely renders answer and clears locally',async()=>{const x=setup();await tick();x.ids.consent.checked=true;x.ids.consent.onchange();x.ids.input.value='Quero um PWA';x.ids.form.onsubmit({preventDefault(){}});await tick();assert.equal(x.calls[1].url,'/api/chat');const payload=JSON.parse(x.calls[1].init.body);assert.equal(payload.consent,'openai-processing-v1');assert.equal(payload.messages[0].content,'Quero um PWA');assert.equal(x.ids.conversation.children.at(-1)?.textContent,'Resposta do mock de teste.');x.ids.reset.onclick();assert.equal(x.ids.conversation.children.length,0)});
test('reset during in-flight request cannot resurrect transcript',async()=>{let finish:any;const pending=new Promise<Response>(r=>finish=r);const x=setup(true,()=>pending);await tick();x.ids.consent.checked=true;x.ids.input.value='Olá';x.ids.form.onsubmit({preventDefault(){}});x.ids.reset.onclick();finish(new Response(JSON.stringify({kind:'ai',reply:'stale answer'})));await tick();assert.equal(x.ids.conversation.children.length,0)});
test('API errors restore text and never label scripted content as AI',async()=>{const x=setup(true,async()=>new Response(JSON.stringify({error:'not_configured',message:'A IA não está disponível.'}),{status:503}));await tick();x.ids.consent.checked=true;x.ids.input.value='Meu pedido';x.ids.form.onsubmit({preventDefault(){}});await tick();assert.equal(x.ids.input.value,'Meu pedido');assert.equal(x.ids.conversation.children[0].className,'message error');assert.equal(x.ids.conversation.children[0].textContent,'A IA não está disponível.')});

test('startup cooldown schedules a status recheck without sending a conversation',async()=>{const x=setup(false,undefined,true);await tick();assert(x.ids.input.disabled);assert.equal(x.timers.length,1);assert(x.ids.notice.textContent.includes('automaticamente'));x.timers[0]();await tick();assert(x.calls.every(c=>c.url==='/api/status'))});

test('public landing renders projects without consent or JavaScript and chat is optional',()=>{const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert(html.includes('FLAVIO CASA'));assert(html.includes('CORPORATION'));assert(html.indexOf('id="projetos"')<html.indexOf('id="consent"'));assert(html.includes('<details id="atendimento"'));assert(!html.includes('<details id="atendimento" open'));assert(html.includes('href="https://construtora.casa/"'));assert(html.includes('Privacidade da conversa'));assert(!html.includes('PORTALFILE'))});
test('slow chat is aborted and restores typed text',async()=>{const x=setup(true,()=>new Promise((_r,reject)=>{const call=x.calls.at(-1);call.init.signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e)})}));await tick();x.ids.consent.checked=true;x.ids.input.value='Mensagem lenta';x.ids.form.onsubmit({preventDefault(){}});assert.equal(x.timers.length,1);x.timers[0]();await tick();assert.equal(x.ids.input.value,'Mensagem lenta');assert(x.ids.conversation.children[0].textContent.includes('demorou demais'));assert.equal(x.send.disabled,false)});
test('HTML error response becomes plain safe retry message',async()=>{const x=setup(true,async()=>new Response('<html>private error</html>',{status:502}));await tick();x.ids.consent.checked=true;x.ids.input.value='Olá';x.ids.form.onsubmit({preventDefault(){}});await tick();assert(x.ids.conversation.children[0].textContent.includes('resposta válida'));assert(!x.ids.conversation.children[0].textContent.includes('private error'))});


test('Quem somos is crawlable, linked, accessible, and preserves reviewed copy',()=>{
 const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/sobre.html',import.meta.url),'utf8');
 assert(home.includes('<a href="/sobre">Quem somos</a>'));
 assert(page.includes('<h1>Flávio Casa</h1>'));
 assert(page.includes('<title>Flavio Casa | FLAVIO CASA CORPORATION'));
 assert(page.includes('href="https://projetos.casa/sobre"'));
 assert(page.includes('aria-current="page"'));
 assert(page.includes('aria-labelledby="company-title"'));
 assert(page.includes('Quem é a FLAVIO CASA CORPORATION?'));
 assert(page.includes('Flávio Casa | Liderança de produto e tecnologia'));
 for(const copy of ['A FLAVIO CASA CORPORATION é a marca que reúne os projetos de tecnologia de Flávio Casa. O trabalho começa com um problema real de quem toca o negócio. A partir daí, a proposta ganha forma num protótipo clicável, que o cliente pode testar antes de decidir o que vale desenvolver.', 'Flávio Casa é empreendedor de Pato Branco, Paraná. Traz para o desenvolvimento de software a experiência de quem já lidou com obras, custos e operações no dia a dia. À frente da FLAVIO CASA CORPORATION, define a direção dos produtos e conduz seu desenvolvimento, da primeira ideia aos testes.', 'Entre seus projetos estão o Construtora.casa, piloto de orçamento e medição de obras; o UnTAGLE, plataforma de comunicação em desenvolvimento; e o Alpha, laboratório de dados eleitorais que apresenta apuração e projeção separadamente.']) assert(page.includes(copy));
 assert(!page.includes('<script'));assert(!page.includes('—'));
 assert(page.includes('https://schema.org/ProfilePage'));
 assert(page.includes('itemprop="alternateName" content="Flavio Casa"'));
 assert(readFileSync(new URL('../public/style.css',import.meta.url),'utf8').includes('flex-wrap:wrap'));
});

test('primary Anjinho CTA precedes secondary navigation, preserves consent and opens only by choice',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert(html.includes('id="chat-cta" class="primary-cta" href="#atendimento">Conversar com Anjinho</a>'));
 assert(html.indexOf('id="chat-cta"')<html.indexOf('secondary-nav'));
 assert(html.indexOf('id="chat-cta"')<html.indexOf('id="projetos"'));
 const x=setup();await tick();assert.equal(x.ids.atendimento.open,false);
 x.ids['chat-cta'].onclick();assert(x.ids.atendimento.open);assert(x.ids.consent.focused);
 assert(!x.ids.consent.checked);assert(x.send.disabled);assert.equal(x.calls.length,1);
 x.ids.atendimento.open=false;x.ids['chat-cta'].onclick();assert(x.ids.atendimento.open);assert.equal(x.calls.length,1);
 x.ids.consent.checked=true;x.ids.consent.onchange();x.ids['chat-cta'].onclick();assert(x.ids.input.focused);
 const y=setup(false);await tick();y.ids['chat-cta'].onclick();assert(y.ids['chat-summary'].focused);assert.equal(y.calls.length,1);
});

test('supplied square portrait follows primary action and has descriptive alt text',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert(html.indexOf('id="chat-cta"')<html.indexOf('class="hero-portrait"'));
 assert(html.includes('width="1254" height="1254"'));
 assert(html.includes('alt="Ilustração em pixel art de Flávio Casa ao lado do Anjinho, seu assistente de IA"'));
 const image=readFileSync(new URL('../public/flavio-anjinho.png',import.meta.url));
 assert.equal(image.subarray(1,4).toString(),'PNG');
});
