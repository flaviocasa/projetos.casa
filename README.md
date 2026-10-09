# projetos.casa

Portal profissional com uma assistente virtual identificada como IA. Código candidato de integração, desligado por padrão.

## Desenvolvimento
Node.js 24 ou superior. Instale as ferramentas de desenvolvimento com `npm ci --ignore-scripts`, execute `npm run typecheck` e `npm test`.

Na primeira instalação local, `npm run init-budget` inicializa o contador persistente. Esse comando recusa bancos existentes; nunca é executado automaticamente em reinícios. `npm start` inicia o servidor local.

## Configuração
Consulte `.env.example` apenas como referência. Insira credenciais diretamente no mecanismo protegido da hospedagem. Não versione `.env`, chaves, bancos ou logs.

A IA permanece desligada até aprovação explícita da base pública, orçamento e configuração. O backend exige consentimento do visitante antes de enviar mensagem e histórico à OpenAI. Sem configuração ou em falhas, não simula respostas.

Os tetos diário e mensal usam UTC. O limite total é cumulativo. O contador exige armazenamento persistente único: banco ausente, danificado ou inconsistente interrompe atendimento. Nunca recrie um volume para recuperar atendimento sem reconciliar o consumo anterior.

O limite interno usa reservas conservadoras por tentativa; não cobre uso da mesma conta fora deste aplicativo, hospedagem, impostos, câmbio ou alterações de preços. Revalide modelo e tarifas antes de habilitar. A verificação de origem protege contra solicitações cross-origin comuns no navegador, mas não é autenticação.

## Dados e escopo
A base profissional está em `knowledge.ts`. Não há ferramentas de ação, envio de leads, pagamentos, contratos ou agendamento. Preços e prazos precisam de avaliação humana. O aplicativo não grava transcrições; OpenAI e infraestrutura podem manter registros conforme suas políticas. Respostas de IA exigem revisão.

## Implantação
Dockerfile valida tipos e testes na fase de build. O runtime usa Node e SQLite sem dependências externas. Um único serviço/replica deve montar volume persistente em `/data`, com `STATE_DIR=/data/portal` e `HOST=0.0.0.0`. Configure `APP_ORIGIN` com o endereço HTTPS exato.

A inicialização do contador precisa acontecer uma única vez em runtime, quando o volume estiver montado. Ela não pode acontecer no build ou pre-deploy. Uma primeira execução explicitamente autorizada pode usar `node init-budget.ts && node server.ts`; depois altere para `node server.ts` antes de habilitar IA. Não mantenha inicialização no comando permanente. Preserve API desligada e limites zero até revisão.

## Verificação
22 testes locais e TypeScript strict aprovados. Testes usam chamadas simuladas apenas no ambiente de teste. Autenticação real, respostas do modelo, renderização e hospedagem precisam ser verificados antes de disponibilização pública.

## Referências
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://docs.railway.com/volumes
