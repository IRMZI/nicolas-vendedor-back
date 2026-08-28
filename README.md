# Nicolas Vendedor — Backend (API + CMS)

API do site de vendas de veiculos do Nicolas: catalogo publico, painel
administrativo completo, metricas reais e auditoria.

Stack: **NestJS + TypeScript + Prisma + PostgreSQL**.

## Funcionalidades

- **Autenticacao**: login por e-mail/senha (Argon2id), JWT em cookies httpOnly,
  refresh token rotativo, sessao persistente, recuperacao de senha, bloqueio
  apos tentativas seguidas, logout, alteracao de perfil e senha.
- **Produtos**: CRUD completo com slug automatico, SKU, descricao rica
  (sanitizada com DOMPurify), preco/preco anterior com desconto calculado,
  estoque opcional, galeria de imagens ordenavel com imagem principal e alt,
  caracteristicas chave/valor, tags, multiplas categorias (N:N), destaque,
  SEO, duplicar, arquivar, restaurar, exclusao logica (lixeira) e definitiva,
  acoes em massa e metricas individuais.
- **Categorias**: CRUD com subcategorias, imagem, icone, ordem, SEO, exibicao
  na home, vinculo/desvinculo de produtos e exclusao com decisao sobre os
  produtos (mover / manter sem categoria / cancelar).
- **Leads**: registro publico ("Tenho interesse", com honeypot anti-spam),
  CRUD administrativo, status com historico, observacoes internas e
  exportacao CSV.
- **Banners e depoimentos**: CRUD com ordenacao, ativacao e agendamento.
- **Configuracoes**: nome, logo, favicon, cores, contatos, WhatsApp e modelo
  de mensagem, redes sociais, rodape, secao Sobre, beneficios, SEO,
  Google Analytics, Meta Pixel, politica de privacidade e termos de uso.
- **Secoes da home**: ativar/desativar/editar cada bloco da pagina inicial.
- **Metricas**: eventos reais (visualizacao de produto/categoria, pesquisa,
  pesquisa sem resultado, clique no WhatsApp = conversao, compartilhamento,
  lead), com deduplicacao por visitante anonimo em janela de tempo,
  series diarias, comparativo com o periodo anterior, rankings, desempenho
  por categoria, origens de acesso e dispositivos.
- **Auditoria**: registro de criacao/edicao/exclusao/status/login/configuracoes
  com usuario, data e resumo das alteracoes (diff campo a campo).
- **Uploads**: validacao por magic bytes, limite de tamanho, otimizacao
  automatica (redimensiona + WebP via sharp), armazenamento local ou
  S3/Cloudflare R2/Supabase Storage.
- **Seguranca**: Helmet, CORS restrito, rate limiting, CSRF double-submit,
  validacao Zod em todas as rotas, sanitizacao de HTML, exclusao logica,
  logs sem dados sensiveis.

## Requisitos

- Node.js 20+
- PostgreSQL 14+

## Instalacao

```bash
npm install
cp .env.example .env        # ajuste DATABASE_URL e os segredos JWT
npx prisma migrate deploy    # cria as tabelas
npm run db:seed              # dados de demonstracao + usuario admin
npm run start:dev            # http://localhost:4000/api
```

Documentacao Swagger em desenvolvimento: `http://localhost:4000/api/docs`.

### Credenciais de desenvolvimento (seed)

| Campo  | Valor |
| ------ | ----- |
| E-mail | `admin@nicolasvendedor.com.br` |
| Senha  | `Admin@123456` |

> Troque a senha (e os segredos JWT do `.env`) antes de qualquer deploy.

## Scripts

| Comando | Descricao |
| --- | --- |
| `npm run start:dev` | desenvolvimento com watch |
| `npm run build` / `start:prod` | build e execucao em producao |
| `npm run prisma:migrate` | nova migration em desenvolvimento |
| `npm run prisma:deploy` | aplica migrations em producao |
| `npm run db:seed` | dados iniciais (idempotente) |
| `npm run db:reset` | zera o banco e reaplica migrations |
| `npm run typecheck` / `lint` / `test` | qualidade |

## Estrutura

```
src/
  common/          # config (Zod), prisma, guards, filtros, pipes, utils
  modules/
    auth/          # login, refresh, recuperacao de senha
    products/      # CRUD + bulk + metricas individuais
    categories/    # CRUD + arvore + exclusao com decisao
    leads/         # contatos + historico + CSV
    banners/ testimonials/ home-sections/ settings/
    analytics/     # registro e agregacao de eventos
    dashboard/     # resumo da visao geral
    audit/         # trilha de auditoria
    storage/ uploads/ mail/
    public/        # endpoints consumidos pelo site
prisma/
  schema.prisma    # 20 tabelas, indices e relacoes N:N
  migrations/
  seed.ts
```

## Deploy

1. Provisione um PostgreSQL (Neon, Railway, RDS, Supabase...).
2. Configure as variaveis do `.env.example` no servico (obrigatorias:
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `CORS_ORIGINS`).
3. Para imagens em producao use `STORAGE_DRIVER=s3` com R2/S3/Supabase
   (o driver `local` exige disco persistente).
4. `npm ci && npm run build && npx prisma migrate deploy && npm run start:prod`.
5. Rode `npm run db:seed` uma unica vez para criar o admin inicial
   (defina `SEED_ADMIN_*` para credenciais proprias).
6. Se o front e a API ficarem em dominios diferentes, use
   `SESSION_COOKIE_SAMESITE=none` e `SESSION_COOKIE_SECURE=true`.
   Com o proxy do front (padrao) nada disso e necessario.
