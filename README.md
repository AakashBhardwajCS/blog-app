# Blog Platform

A compact full-stack blogging application. The frontend is **Next.js + TypeScript** and the API is **NestJS + TypeScript**. PostgreSQL is accessed exclusively through Prisma.

## Features

- Register and sign in with JWT authentication
- Public post list and individual post pages
- Authenticated create, edit, publish/unpublish, and delete actions for an author's own posts
- URL-safe unique slugs, drafts, excerpts, tags, and author details
- Validated API payloads and typed Prisma/React data (no `any`)
- Hybrid RAG assistant over published articles using Prisma keyword retrieval and Chroma vector search

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

Start ChromaDB separately before the backend. For the default local configuration:

```bash
docker run -d --name crownstack-chroma -p 8000:8000 chromadb/chroma
```

Set `CHROMA_URL` and `CHROMA_COLLECTION` in `backend/.env` if needed. Published posts are indexed into Chroma at backend startup and refreshed periodically. The assistant combines Prisma keyword matches with Chroma vector matches, then grounds its answer in the fused results. It is available to visitors from the bottom-right `Ask CrownStack` button and through `POST /api/rag/ask` with `{ "query": "..." }`.

Manual reindexing is available to authenticated users with `POST /api/rag/index`.

During development the API accepts requests from local browser origins. In production, set
`FRONTEND_URL` in `backend/.env` to a comma-separated allow-list of the deployed frontend URLs.

## API

`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

`GET /api/posts`, `GET /api/posts/:slug`, `GET /api/posts/mine/list`, `POST /api/posts`, `PATCH /api/posts/:id`, `DELETE /api/posts/:id`

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

Send `Authorization: Bearer <token>` for protected routes. `GET /api/posts` accepts optional `page`, `limit`, and `tag` query values.
