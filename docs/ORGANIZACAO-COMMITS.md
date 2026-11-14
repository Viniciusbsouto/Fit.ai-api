# Organização dos commits — 13/11/2026

## Backend

Repositório: `bootcamp-treinos-aula-00/`, branch `main`, remoto `origin` em `https://github.com/Viniciusbsouto/Fit.ai-api.git`.

Base preservada: `90310cc` (`checkpoint: melhorias atuais antes da integracao com novas funcionalidades`). O staging estava vazio, e a branch estava alinhada à referência local `origin/main` antes da organização.

| Commit | Mensagem | Conteúdo |
| --- | --- | --- |
| `50894c1` | `chore(repo): stop tracking build artifacts` | Retira 38 arquivos compilados de `dist/` apenas do índice; preserva os arquivos locais. Inclui regras de ignore e exclusão de gerados do lint. |
| `d9af01a` | `feat(config): add environment validation and Google OAuth` | Ambiente validado, exemplo sem segredos, banco e autenticação configuráveis, Google opcional, cookies entre subdomínios, logs com proteção de credenciais e configuração do gateway preservada. |
| `205225d` | `feat(api): add stable OpenAPI operation IDs` | Identificadores explícitos de operações e wildcard de autenticação oculto no Swagger principal. |
| `3e9f997` | `build(api): add Docker support and Prisma generation` | Dockerfile em etapas, contexto Docker filtrado, geração Prisma no build e remoção do SDK OpenAI não utilizado com seu lockfile. |
| `e1b358c` | `test(api): add integration tests` | Dez testes com serviços simulados e scripts de lint, typecheck e integração. |
| Este commit | `docs(api): document configuration and deployment` | Relatório de integração e registro da organização final. |

Os trechos compartilhados de `src/index.ts`, `src/routes/ai.ts` e `package.json` foram separados diretamente no índice Git, sem editar os arquivos de trabalho. Não houve rebase, amend, substituição de histórico ou descarte de alterações.

### Política final de build

`dist/` deixou de ser versionado. A descrição de artefatos rastreados em `INTEGRACAO-AULA03.md` registra o estado anterior à organização. Instalações novas devem executar `pnpm install --frozen-lockfile` e `pnpm build` antes de `pnpm start`; o Dockerfile já executa o build. Não basta copiar os antigos arquivos compilados, pois os novos módulos de ambiente também precisam ser gerados.

### Preservação e verificações desta organização

- Hashes dos arquivos existentes dos dois projetos, incluindo os `.env` locais, foram comparados antes e depois dos cinco primeiros commits e dos testes: nenhum conteúdo mudou. Este documento é uma adição posterior à comparação.
- Schema Prisma, migrações, Compose, casos de uso e `scripts/prepare-db.mjs` permanecem sem diff em relação à base.
- A varredura dos arquivos candidatos não encontrou padrões de credenciais reais nem cópias dos segredos presentes no `.env` do backend. Valores não foram exibidos. Credenciais e artefatos locais não foram adicionados.
- Backend: build e typecheck passaram; 10 testes de integração e 6 testes de home passaram.
- Backend: lint completo mantém dois erros preexistentes em `scripts/prepare-db.mjs`, linhas 1 e 64 (ordenação de imports e ausência de `cause`). O arquivo foi preservado.
- Frontend: TypeScript sem emissão/incremental e lint passaram.
- Nenhum teste desta etapa chamou o gateway real, executou OAuth Google completo ou alterou o banco. Build Docker e build de produção do frontend não foram executados nesta organização.

## Frontend

Repositório separado: `bootcamp-treinos-frontend-main/`, branch `main`, remoto `origin` em `https://github.com/Viniciusbsouto/Fit.ai-web.git`.

O único commit existente, `d240682` (`first commit`), já contém o estado atual completo: home autenticada, experiência inicial, componentes de dashboard e progresso, onboarding, Coach IA, teclas de envio, animações, erros e streaming, imagens, navegação, Google OAuth opcional e configuração de ambiente. Não existem diferenças de arquivos rastreados contra esse commit, nem staging pendente.

Nenhum commit novo foi criado no frontend. Separar retroativamente as funcionalidades desse commit exigiria reescrever o histórico, operação não autorizada e não realizada.

O arquivo não rastreado `.claude/settings.local.json` foi mantido no disco e fora dos commits por ser configuração local da ferramenta. Não houve mudança no ignore para esconder essa pendência. Os arquivos `.env`, caches e dependências permanecem fora do versionamento.

## Situação dos remotos

Nenhum push foi executado. Ao final, o backend deve estar seis commits à frente da referência local `origin/main`; o frontend permanece alinhado à sua referência local. A consulta de `refs/heads/main` nos dois remotos falhou por indisponibilidade de conexão com o GitHub. Portanto, essas comparações usam as referências locais existentes, sem afirmar que o servidor não recebeu alterações externas.

Os arquivos `FITAI-LOCAL.md` e `RELATORIO-COMMITS.md` na pasta pai permanecem fora dos dois repositórios e registram etapas anteriores. Este documento descreve a organização atual.
