# 与 Cloudflare Worker 的架构说明

## 当前架构：Worker + Static Assets（同域一体部署）

按 [Cloudflare Static Assets 文档](https://developers.cloudflare.com/workers/static-assets/) 实现：**前端静态资源与 Worker 一起部署，同一域名**。

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                 │
└─────────────────────────────────────────────────────────────────┘
         │
         │ 访问 https://xxx.workers.dev
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker（同一域名）                        │
│  run_worker_first: ["/api/*", "/health"]                         │
├─────────────────────────────────────────────────────────────────┤
│  /api/*, /health  → Worker 脚本（Hono）→ D1 / R2 / Cron          │
│  其它路径          → Static Assets（frontend/dist）               │
│  未匹配路径        → single-page-application → index.html        │
└─────────────────────────────────────────────────────────────────┘
```

- **前端**：`frontend/dist` 作为 Static Assets 上传，由 CF 直接托管，不经过 Worker 脚本。
- **后端**：`/api/*`、`/health` 由 Worker（Hono）处理，使用 D1、R2、Cron。
- **同域**：部署时前端用 `VITE_API_BASE=""`，生产环境请求 `/api/...` 即同源，无需 CORS 或单独域名。

## wrangler 配置要点

在 `backend/wrangler.toml` 中（由 `pnpm deploy` 生成）：

```toml
[assets]
directory = "../frontend/dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = ["/api/*", "/health"]
```

- **directory**：相对 wrangler.toml 的路径，指向前端构建产物。
- **not_found_handling = "single-page-application"**：未匹配到文件时返回 `index.html`，适合 SPA。
- **run_worker_first**：这些路径先走 Worker，其余走静态资源。

## 部署流程（pnpm deploy）

1. 生成 `backend/wrangler.toml`（含上述 `[assets]`）。
2. **先**构建前端：`VITE_API_BASE=""`（同域）。
3. **再**在 backend 目录执行 `wrangler deploy`：上传 Worker 代码 + `../frontend/dist` 的静态资源。

完成后，访问 `https://你的Worker.workers.dev` 即可打开前端页面，API 请求自动发往同域 `/api/*`。

## 本地开发 vs 生产

| 环境     | 前端从哪来     | API 请求发往哪           |
|----------|----------------|---------------------------|
| 本地开发 | Vite dev       | Vite 代理 `/api` → 8787  |
| 生产     | Worker Static Assets | 同域 `/api`（相对路径） |

## 可选：仅部署 Worker（不带上前端）

若只更新后端、不更新前端：

```bash
pnpm deploy --skip-frontend
```

此时不会重新构建 `frontend/dist`，wrangler 会使用**当前已有的** `frontend/dist`（若存在）上传；若不存在，本次部署将没有静态资源。

## 小结

- 前端由 Worker 的 **Static Assets** 托管，与 CF 文档一致，**符合** Worker 一体部署架构。
- 一次 `pnpm deploy` 即完成「前端 + 后端」同域部署，无需单独部署 Pages 或配置 `VITE_API_BASE` 为绝对 Worker URL。
