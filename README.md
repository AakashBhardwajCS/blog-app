# Blog Platform

A compact full-stack blogging application. The frontend is **Next.js + TypeScript** and the API is **NestJS + TypeScript**. PostgreSQL is accessed exclusively through Prisma.

## Features

- Register and sign in with JWT authentication
- Public post list and individual post pages
- Authenticated create, edit, publish/unpublish, and delete actions for an author's own posts
- URL-safe unique slugs, drafts, excerpts, tags, and author details
- Validated API payloads and typed Prisma/React data (no `any`)

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

Visit `http://localhost:3000`; the API is at `http://localhost:3001/api`.

During development the API accepts requests from local browser origins. In production, set
`FRONTEND_URL` in `backend/.env` to a comma-separated allow-list of the deployed frontend URLs.

## API

`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

`GET /api/posts`, `GET /api/posts/:slug`, `GET /api/posts/mine/list`, `POST /api/posts`, `PATCH /api/posts/:id`, `DELETE /api/posts/:id`

Send `Authorization: Bearer <token>` for protected routes. `GET /api/posts` accepts optional `page`, `limit`, and `tag` query values.
