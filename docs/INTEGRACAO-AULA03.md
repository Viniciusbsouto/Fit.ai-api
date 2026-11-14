# Integração incremental da Aula-03 no Aula-00

O Aula-00 permanece como backend principal. A Aula-03 foi somente consultada; seus arquivos foram verificados por hash ao final. Nenhum arquivo `.env` real foi alterado ou copiado. Nenhuma migração, reset, publicação ou gravação em banco foi executada.

## Funcionalidades incorporadas

- Google OAuth opcional no Better Auth, preservando `emailAndPassword.enabled`, sessões e encaminhamento de múltiplos cookies.
- Validação Zod de ambiente, incluindo as variáveis atuais da TeamSocLo. Os erros enumeram nomes de campos, sem valores. Porta padrão 8081 e alias `BETTER_AUTH_URL` preservados. Se o alias e `API_BASE_URL` coexistirem, devem apontar para a mesma origem.
- CORS e `trustedOrigins` usam a mesma origem exata, definida por `WEB_APP_BASE_URL`. O padrão de desenvolvimento continua `http://localhost:3000`; produção exige URLs HTTPS explícitas. CORS permite credenciais, sem wildcard ou inclusão automática de localhost em produção.
- Host `0.0.0.0`, Dockerfile em etapas com Node 24, pnpm fixado, execução sem root e caminho correto `dist/src/index.js`. `.dockerignore` exclui credenciais e dependências locais. O container não aplica migrações automaticamente.
- Logs JSON com nível debug em desenvolvimento, info em produção e desabilitados em testes. URLs de requisição (incluindo códigos OAuth), erros brutos e cabeçalhos sensíveis não são registrados pelo logger da aplicação. Erros do gateway usam mensagem fixa, substituindo o log bruto padrão do SDK. Não foi necessária a dependência `pino-pretty`.
- `operationId` explícitos, mantendo nomes já existentes no Orval: `getHomeData`, `getUserTrainData`, `putMe`, `getStats`, `getWorkoutPlans`, `postWorkoutPlans`, `getWorkoutPlan`, `getWorkoutDay`, `startWorkoutSession`, `updateWorkoutSession`, `postAi` e `getRoot`. O wildcard de autenticação fica oculto no Swagger principal; a documentação própria do Better Auth permanece disponível.

## Preservação do Coach IA

O backend continua usando **TeamSocLo**, através de `@ai-sdk/anthropic` já instalado:

- Base padrão: `https://gpt.teamsoclo.site/v1` (o SDK acrescenta `/messages`). O schema exige caminho `/v1`, evitando configurações que perderiam essa parte do endpoint.
- Requisição: `POST /v1/messages`, `Authorization: Bearer`, `anthropic-version: 2023-06-01`.
- Modelo preservado: `claude-haiku-4-5`.
- Endpoint do frontend preservado: `/ai`, com histórico em `messages`, cookies e resposta UI Message Stream.
- Prompt, conversão do histórico, limite de etapas e ferramentas de leitura, atualização e criação de planos preservados. Os casos de uso não foram alterados.
- Sem token, a aplicação ainda inicia e o chat autenticado retorna 503, como antes. Credenciais inválidas ou falta de créditos continuam dependendo do gateway.
- Removida somente a dependência direta não utilizada `@ai-sdk/openai`, incluindo suas entradas no lockfile. Nenhuma dependência Google de IA foi incorporada. O schema não exige `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `GOOGLE_GENERATIVE_AI_API_KEY`.

A validação agora interrompe o boot para configuração inválida: por exemplo, secret de autenticação menor que 32 caracteres, URL incorreta, credenciais Google incompletas ou URLs de produção sem HTTPS. O `.env` atual passou na validação sem mudanças. Nenhuma chamada real à TeamSocLo foi feita durante esta integração.

## Banco e compatibilidade

Os schemas Prisma das duas aulas são idênticos e já possuem `Account`, `Session` e `Verification`, necessários ao Google OAuth. **Não é necessária migração de banco para estas melhorias.** As migrações iniciais têm identificadores diferentes: a migração da Aula-03 não deve ser copiada sobre o histórico do Aula-00. O schema e a migração atual foram comparados com a cópia anterior à integração e permanecem idênticos.

As versões de Better Auth, Fastify, Prisma e Zod são iguais entre as aulas. Nenhuma atualização de versão ou nova dependência foi necessária. `pnpm install --lockfile-only --offline --ignore-scripts --frozen-lockfile` confirmou a consistência do lockfile atualizado.

O Swagger anterior e posterior foi gerado a partir das duas versões das rotas e comparado: os contratos das 9 rotas documentadas são idênticos, exceto por `operationId`. Métodos, caminhos e schemas de requisição/resposta foram preservados, incluindo o retorno `null` da home sem plano ativo. Não é necessário regenerar o cliente Orval para usar esta integração. Uma futura regeneração manterá os nomes existentes; o transformer atual pode continuar como fallback. O chat utiliza seu transporte de streaming e o login utiliza o cliente Better Auth, independentemente do Orval.

## Ativação do Google e deploy

1. Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` exclusivamente no backend. Ambos vazios deixam Google desabilitado.
2. Configure no Google Console o redirect `${API_BASE_URL}/api/auth/callback/google`, por exemplo `http://localhost:8081/api/auth/callback/google` localmente. Referência: [documentação oficial do Better Auth](https://better-auth.com/docs/authentication/google).
3. No frontend, configure `GOOGLE_OAUTH_ENABLED=true` para exibir o botão existente. Sem essa flag, permanece apenas o formulário de e-mail/senha. O callback usa a origem real da janela, sem necessidade de mudar contratos ou expor credenciais.
4. Alinhe `NEXT_PUBLIC_API_URL` do frontend com `API_BASE_URL` do backend e `WEB_APP_BASE_URL` com a origem real do frontend. Reinicie/recompile conforme a plataforma aplicar suas variáveis de ambiente.
5. Em produção, use HTTPS. Para frontend e API em subdomínios do mesmo domínio, configure `COOKIE_DOMAIN=.seu-dominio.com`; o schema verifica se ambos pertencem ao domínio. Isso permite que os componentes de servidor do Next recebam a sessão. Não foi copiado o domínio fixo da Aula-03. Veja [cookies no Better Auth](https://better-auth.com/docs/concepts/cookies).

Frontend e backend em domínios sem parentesco não são resolvidos apenas com CORS ou `COOKIE_DOMAIN`, especialmente porque o frontend atual lê a sessão durante a renderização no servidor. Nesse cenário, planeje um domínio/proxy comum antes do deploy; essa mudança de arquitetura não foi feita nesta integração.

Build da imagem, a partir do Aula-00: `docker build -t fitai-api .`. Injete as variáveis de produção somente em runtime, por exemplo `docker run --rm -p 8081:8081 --env-file <arquivo-privado-de-producao> fitai-api`. Use uma URL de banco acessível pelo container; `localhost:5434` do exemplo é para execução local no host. O Compose e seu volume atual foram preservados.

## Verificações realizadas

| Verificação | Resultado |
| --- | --- |
| Backend `pnpm build` (Prisma generate + TypeScript) | Passou |
| Backend `pnpm typecheck` | Passou |
| Backend `pnpm test:integration` | 10 testes passaram, com gateway/auth/persistência simulados |
| Regressão existente `node --test scripts/test-home.mjs` | 6 testes passaram |
| Lint dos fontes, teste novo e configuração ESLint | Passou |
| Backend `pnpm lint` completo | Dois erros preexistentes em `scripts/prepare-db.mjs`: ordenação de imports, linha 1; `preserve-caught-error`, linha 64. Arquivo preservado por estar fora desta integração |
| Frontend `pnpm exec tsc --noEmit` | Passou |
| Frontend `pnpm lint` | Passou |
| Frontend `pnpm build` | Bloqueado por acesso de rede a Google Fonts: Anton, Geist, Geist Mono e Inter Tight |
| Ambiente real do backend | Válido; sem imprimir credenciais |
| Contratos OpenAPI antes/depois | Idênticos em 9 caminhos, excluindo `operationId` |
| Schema, migração e casos de uso | Preservados |
| Arquivos da Aula-03 | Hashes preservados |
| Docker build/runtime | Não executado: acesso ao daemon Docker negado neste ambiente |
| OAuth Google completo e gateway real | Não executados; dependem de credenciais/serviços externos |

Os testes novos verificam configuração válida/inválida, ausência de segredos nas mensagens de erro, coexistência dos provedores, CORS, operações OpenAPI, rotas protegidas, múltiplos cookies, resposta 503 sem token, falha privada do gateway e streaming com histórico e execução da ferramenta de criação de plano. O teste de criação simula a persistência e não grava um plano real.

## Arquivos modificados e adicionados

| Local | Arquivos | Alteração |
| --- | --- | --- |
| Aula-00 raiz | `package.json`, `pnpm-lock.yaml` | Build com geração Prisma, scripts de verificação e remoção do SDK OpenAI sem uso |
| Aula-00 raiz | `.gitignore`, `eslint.config.js` | Exclusão de build/arquivos gerados e proteção de arquivos de ambiente |
| Aula-00 raiz | `.env.example`, `.dockerignore`, `Dockerfile` (novos) | Configuração documentada e empacotamento |
| Aula-00 `src` | `index.ts` | Host, CORS, logs, URL pública, Swagger e importação sem abrir porta para testes |
| Aula-00 `src/lib` | `auth.ts`, `db.ts`, `env.ts` e `env-schema.ts` (dois últimos novos) | Google opcional e ambiente validado |
| Aula-00 `src/routes` | `ai.ts`, `home.ts`, `me.ts`, `stats.ts`, `workout-plan.ts` | IDs estáveis; IA usa ambiente validado e log de erro seguro |
| Aula-00 `scripts` | `test-integration.mjs` (novo) | Testes sem serviços externos ou mutações reais |
| Aula-00 `docs` | `INTEGRACAO-AULA03.md` (novo) | Este relatório |
| Frontend | `.gitignore`, `.env.example` (novo), `app/auth/page.tsx`, `app/auth/_components/sign-in-with-google.tsx` | Exibição opcional do Google, callback na origem real e exemplo sem segredos |
| Aula-00 `dist/src` | `index.js`, `lib/auth.js`, `lib/db.js`, `routes/ai.js`, `routes/home.js`, `routes/me.js`, `routes/stats.js`, `routes/workout-plan.js` | Artefatos já rastreados no repositório, regenerados pelo build |

Os novos módulos compilados `dist/src/lib/env.js` e `env-schema.js` são gerados e ignorados, assim como os demais novos artefatos. Execute sempre `pnpm build` antes de `pnpm start`; o Dockerfile já faz isso. Nenhum arquivo gerado pelo Orval foi alterado.
