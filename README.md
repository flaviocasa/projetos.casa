# projetos.casa

Portal profissional com assistente virtual identificada como IA, desligada por padrão.

## Desenvolvimento
Node.js 24+. Execute `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` e `npm start`. Não há inicialização de banco de dados.

## Configuração
Consulte `.env.example`. Insira OPENAI_API_KEY diretamente no mecanismo protegido da hospedagem; nunca versione chaves. Configure APP_ORIGIN com o endereço HTTPS exato. API_ENABLED controla o desligamento e KNOWLEDGE_APPROVED registra a aprovação da base pública em knowledge.ts.

O aplicativo não controla gastos nem promete teto financeiro. O responsável acompanha consumo e limites diretamente no provedor. Variáveis financeiras de versões anteriores não são usadas.

## Proteção de uso
Um único processo e uma única réplica. Limites globais: 10 tentativas por minuto, 2 chamadas simultâneas, saída de até 800 tokens, timeout de 25 segundos e histórico limitado. Falhas também contam no limite de frequência, sem repetição automática. Todo novo processo aguarda 60 segundos antes de aceitar chamadas. O status HTTP continua saudável durante essa espera. As proteções são em memória, não compartilhadas entre réplicas, e não garantem limite monetário. A origem não é autenticação; clientes externos podem imitá-la.

## Dados e escopo
Consentimento explícito do visitante antes de enviar mensagens e histórico à OpenAI. Nenhuma resposta simulada em produção. Sem ferramentas de ação, envio de leads, pagamentos, contratos ou agendamento. Preços e prazos precisam de aprovação humana. Não grava transcrições; OpenAI e hospedagem podem manter registros conforme suas políticas. Respostas de IA exigem revisão.

## Implantação
O Dockerfile verifica tipos e testes antes de montar o runtime. Comando permanente: `node server.ts`. HOST=0.0.0.0 e PORT=3000 no Railway. Armazenamento persistente e SQLite não são necessários para este serviço. Volumes antigos não são apagados automaticamente. A chave permanece somente no servidor.

## Referências
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
