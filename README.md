# Blog Platform

A compact full-stack blogging application. The frontend is **Next.js + TypeScript** and the API is **NestJS + TypeScript**. PostgreSQL is accessed exclusively through Prisma.

## Features

- Register and sign in with JWT authentication
- Organizations (tenants) with owner/admin/member roles and invite links; posts are visible only to members of their organization
- Create, edit, publish/unpublish, and delete your own posts; owners and admins can delete any post or comment
- URL-safe unique slugs, drafts, excerpts, departments, and author details
- Validated API payloads and typed Prisma/React data (no `any`)
- Hybrid RAG assistant over published articles using Postgres full-text search and pgvector similarity search

## Structure

- `frontend/` — Next.js App Router UI styled with Tailwind CSS
- `backend/` — NestJS REST API and Prisma schema

## Start locally

The existing local Postgres container is configured as `postgresql://postgres:postgres@localhost:5432/myapp`.

```bash
cp backend/.env.example backend/.env
npm install
npm run prisma:generate --workspace=backend
npm run prisma:migrate --workspace=backend
npm run dev:backend
# separate terminal
npm run dev:frontend
```

Visit `http://localhost:3000`; the blog API is at `http://localhost:3001/api`.

### RAG assistant

Start the pgvector database (`docker compose up -d pgvector`) and an OpenAI-compatible model server such as Ollama:

```bash
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

The `PGVECTOR_DATABASE_URL`, `LOCAL_LLM_*` and `EMBEDDING_MODEL` settings are in `backend/.env.example`. Each organization's published posts are chunked and embedded into pgvector at backend startup and whenever they change. The assistant fuses full-text and vector matches, then grounds its answer in those excerpts. It searches only the signed-in user's organization, and is available from the bottom-right `Ask CrownStack` button and through `POST /api/rag/ask` with `{ "query": "..." }`.

Manual reindexing is available to authenticated users with `POST /api/rag/index`.

During development the API accepts requests from local browser origins. In production, set
`FRONTEND_URL` in `backend/.env` to a comma-separated allow-list of the deployed frontend URLs.

## API

`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

`GET /api/posts`, `GET /api/posts/:slug`, `GET /api/posts/mine/list`, `POST /api/posts`, `PATCH /api/posts/:id`, `DELETE /api/posts/:id`

`GET /api/posts/search`, `GET /api/posts/:slug/engagement`, `POST /api/posts/:slug/like`, `POST /api/posts/:slug/comments`, `DELETE /api/posts/:slug/comments/:commentId`

`GET|PATCH /api/organization`, `GET /api/organization/members`, `PATCH|DELETE /api/organization/members/:id`, `POST /api/organization/members/:id/restore`, `GET|POST /api/organization/invites`, `DELETE /api/organization/invites/:id`, and the public `GET /api/invites/:code` preview used by the sign-up page

The authenticated agent is available at `POST /api/agent/chat` and discovers tools from the external
MCP server configured by `MCP_SERVER_URL` (default `http://127.0.0.1:3002/mcp`). The local model is
configured with `LOCAL_LLM_BASE_URL` and `LOCAL_LLM_MODEL` and must support OpenAI-compatible tool calls.

The app can also proxy MCP tool calls for authenticated users through `GET /api/agent/mcp/tools` and
`POST /api/agent/mcp/tools/call`.

Blog tools implemented in this repository are `list_my_posts`, `get_my_post`, `create_post`,
`update_post`, `publish_post`, and `delete_post`. The frontend can discover and call them through the
authenticated `GET /api/agent/tools` and `POST /api/agent/tools/call` routes. The external MCP server
can bridge its tool handlers to `GET /api/mcp/tools` and `POST /api/mcp/tools/call` using
`x-mcp-bridge-secret: $MCP_BRIDGE_SECRET` and `x-user-id: <authenticated-user-id>` headers.

Send `Authorization: Bearer <token>` for protected routes. All post routes require a token and return only the caller's organization's posts. `GET /api/posts` accepts optional `page`, `limit`, and `department` query values.
