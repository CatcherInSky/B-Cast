# 初始化

## 命令
在根目录执行 `pnpm init`

## 执行内容
1. 检查 wrangler 登录状态
   - 使用 `wrangler whoami` 检查是否已登录
   - 如果未登录 → 自动执行 `wrangler login`
2. 命令行询问创建D1名称（如果直接enter就给一个默认值 `b-cast`）
   - 使用 `wrangler d1 create <name>` 自动创建
3. 命令行询问创建R2 bucket名称（如果直接enter就给一个默认值 `b-cast`）
   - 尝试使用 `wrangler r2 bucket create <name>` 自动创建
   - **注意**：如果wrangler命令不可用或失败，提示用户去Cloudflare Dashboard手动创建
   - 创建方式：访问 https://dash.cloudflare.com/ → R2 → Create bucket
   - 创建后验证：使用 `wrangler r2 bucket list` 验证bucket是否存在，或询问用户是否已创建
4. 提示用户在Cloudflare Dashboard中配置R2公开访问（可选，用于直接访问RSS和音频文件）
5. 保存相关数据到本地 `.env` 文件（D1_DATABASE_NAME、D1_DATABASE_ID、R2_BUCKET_NAME）
6. 初始化远程数据库：使用 `wrangler d1 execute <name> --remote --file=backend/scripts/init-db.sql`
   - **注意**：本地D1的初始化会在首次启动后端服务时自动进行（见"本地开发环境"章节）
7. 安装前后端依赖
8. （可选）部署Worker以获取URL
   - 询问用户是否要部署Worker
   - 如果选择部署：执行 `wrangler deploy`，从部署输出中提取Worker URL并保存到 `.env`
   - 如果选择不部署：提示用户稍后运行 `pnpm deploy` 时会自动获取URL
9. 打印相关信息提醒设置 GitHub Secret Variables（参考"GitHub Action 部署"章节）

## Gitignore 配置
需要添加到 `.gitignore` 的文件：
- `.env` - 本地环境变量（包含敏感信息，统一放在根目录）
- `backend/wrangler.toml` - 包含 database_id 等敏感配置

# 部署

## 判断是否需要init
- 检查 `.env` 文件是否存在
- 如果不存在 → 需要 init
- 如果存在但关键字段缺失 → 提示重新 init 或修复

## 部署方式

### 本地部署
在根目录执行 `pnpm deploy`
- 读取本地 `.env` 文件
- 如果没有 `.env` 文件 → 提示运行 `pnpm init`
- 验证 `.env` 中的配置是否完整有效
- 自动检查并处理 wrangler 登录状态

### GitHub Action 部署
通过 GitHub Actions 自动触发（可选）

**部署内容：** 同时部署后端Worker和前端静态文件

**Workflow文件：** `.github/workflows/deploy.yml`（统一处理前后端部署）

#### GitHub Secrets 依赖关系

**部署Worker（必需）：**
- `CLOUDFLARE_API_TOKEN` - Cloudflare API Token
  - 获取方式：https://dash.cloudflare.com/profile/api-tokens
  - 权限需要：Account.Cloudflare Workers:Edit, Account.Workers Scripts:Edit, Account.Workers KV Storage:Edit, Account.D1:Edit, Account.R2:Edit
  - 用途：部署Worker到Cloudflare
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare Account ID
  - 获取方式：https://dash.cloudflare.com/ → 右侧栏显示 Account ID
  - 用途：部署Worker到Cloudflare
- `D1_DATABASE_NAME` - D1数据库名称
  - 用途：GitHub Actions部署时生成 `wrangler.toml` 配置
  - 格式：与init时创建的数据库名称一致（如 `b-cast`）
- `D1_DATABASE_ID` - D1数据库ID
  - 用途：GitHub Actions部署时生成 `wrangler.toml` 配置
  - 格式：UUID格式（如 `e0dae4e1-ceda-467d-b7cb-0f437819eaf7`）
  - 获取方式：从 `.env` 文件或 Cloudflare Dashboard 中获取
- `R2_BUCKET_NAME` - R2存储桶名称
  - 用途：GitHub Actions部署时生成 `wrangler.toml` 配置
  - 格式：与init时创建的bucket名称一致（如 `b-cast`）

**下载功能（可选，如果使用GitHub Action下载）：**
- `WORKER_URL` - Worker API地址（用于下载脚本调用Worker API）
- `R2_BUCKET_NAME` - R2存储桶名称（已在"部署Worker"中列出，这里复用）

**如果未配置必需的GitHub Secrets，部署会失败并提示缺少的配置**

## 部署检测逻辑
```
执行 pnpm deploy 时：
1. 检查 wrangler 登录状态
   - 使用 `wrangler whoami` 检查是否已登录
   - 如果未登录 → 自动执行 `wrangler login`
2. 检查 .env 文件是否存在
3. 如果不存在 → 提示运行 pnpm init
4. 如果存在 → 读取配置并执行部署
```

## 本地变量管理
- 统一使用 `.env` 文件存储本地配置
- 包含字段：
  - `D1_DATABASE_NAME` - D1数据库名称
  - `D1_DATABASE_ID` - D1数据库ID
  - `R2_BUCKET_NAME` - R2存储桶名称
  - `WORKER_URL` - Worker部署后的URL（后端Worker的地址，可选）
    - **用途说明**：
      - Cron任务：生成RSS时需要使用Worker URL作为baseUrl（如果未配置，会使用请求origin或硬编码默认值）
      - 本地测试脚本：调用Worker API（如果使用）
    - **获取方式**：部署后从部署输出自动提取并保存到 `.env`

**重要**：本地 `.env` 不保存 `CLOUDFLARE_API_TOKEN`。Token 仅用于 GitHub Actions（通过 GitHub Secrets 提供）。

## 本地开发环境

### 支持两种模式切换

**实现方式：**
- 通过命令行参数切换开发模式
- 默认使用本地模式（安全，不影响生产数据）

**命令设计：**
```bash
# 本地模式（默认）- 使用本地D1和本地R2模拟
pnpm dev:backend:local
# 或
pnpm dev:backend  # 默认等同于 dev:backend:local

# 远程模式 - 连接线上D1和R2
pnpm dev:backend:remote
```

**技术实现：**
- 本地模式：`wrangler dev --local`（使用本地SQLite和Miniflare模拟R2）
  - 本地D1初始化机制（可执行、可重复运行）：
    - 在启动 `wrangler dev --local` 之前先执行一次：
      - `wrangler d1 execute <D1_DATABASE_NAME> --local --file=backend/scripts/init-db.sql`
    - `init-db.sql` 需要保持幂等（`CREATE TABLE IF NOT EXISTS`），确保重复运行不会破坏数据
- 远程模式：`wrangler dev --remote`（连接线上Cloudflare资源）
  - 需要wrangler已登录才能使用远程模式

# 测试场景与脚本

## 测试命令（开发测试）

### 1. 本地全栈测试
**命令：** `pnpm dev:local`
- 同时启动本地前端和本地后端（连接本地D1和本地R2）
- 使用并发工具（如 `concurrently`）同时运行前后端

**测试流程：**
- 前端输入B站URL → 后端生成RSS → 写入本地D1 → RSS存入本地R2
- 前端输入RSS URL → 后端解析RSS → 写入本地D1 → RSS存入本地R2

**适用场景：** 完整本地开发测试，不影响线上数据

### 2. 混合模式：本地全栈 + 线上数据
**命令：** `pnpm dev:local:remote`
- 同时启动本地前端和本地后端（连接线上D1和线上R2）

**测试流程：**
- 前端输入B站URL → 本地后端生成RSS → 写入线上D1 → RSS存入线上R2
- 前端输入RSS URL → 本地后端解析RSS → 写入线上D1 → RSS存入线上R2

**适用场景：** 本地调试后端代码，但使用线上数据验证

## 初始化脚本

### 脚本：`scripts/init.js` 或 `scripts/init.sh`
**命令：** `pnpm init`

**功能：**
1. 检查依赖（Node.js、wrangler等）
2. 检查 wrangler 登录状态
   - 使用 `wrangler whoami` 检查是否已登录
   - 如果未登录 → 自动执行 `wrangler login`
3. 创建D1数据库（询问名称，默认 `b-cast`）
4. 提示创建R2 bucket（询问名称，默认 `b-cast`）
   - 创建后验证bucket是否存在
5. 保存配置到 `.env` 文件
6. 初始化远程数据库（执行 `backend/scripts/init-db.sql`）
   - 使用 `wrangler d1 execute <name> --remote --file=backend/scripts/init-db.sql`
   - **注意**：本地D1会在首次启动后端服务时自动初始化
7. 安装前后端依赖
8. （可选）部署Worker以获取URL
   - 询问用户是否要部署Worker
   - 如果选择部署：执行 `wrangler deploy`，从部署输出中提取Worker URL并保存到 `.env`
   - 如果选择不部署：提示用户稍后运行 `pnpm deploy` 时会自动获取URL
9. 打印GitHub Secrets配置提示（参考"GitHub Action 部署"章节）

**输出：**
- 生成/更新 `.env` 文件
- 打印配置摘要和下一步提示

## 部署脚本

### 脚本：`scripts/deploy.js` 或 `scripts/deploy.sh`
**命令：** `pnpm deploy`

**功能：**
1. 检查 wrangler 登录状态
   - 使用 `wrangler whoami` 检查是否已登录
   - 如果未登录 → 自动执行 `wrangler login`
2. 检查 `.env` 文件是否存在
3. 生成/更新 `backend/wrangler.toml`（根据 `.env` 中的配置）
4. 部署后端到 Cloudflare Workers
   - 本地部署依赖 `wrangler login`（不要求在 `.env` 中保存 `CLOUDFLARE_API_TOKEN`）
5. 从部署输出中提取 Worker URL，自动更新 `.env` 文件（如果为空）
6. 构建前端（`pnpm build:frontend`）
   - 前端使用相对路径 `/api/...` 访问后端API（本地开发时Vite proxy会代理，线上使用同域或配置反向代理）
7. 部署前端到静态托管服务
   - 方式1：通过GitHub Actions自动部署到GitHub Pages
   - 方式2：手动上传 `frontend/dist` 目录到其他静态托管服务（如Cloudflare Pages、Vercel等）

**输出：**
- 部署结果和Worker URL
- 配置验证错误提示

## 测试脚本（下载流程）

### 脚本拆分原则
- **每个测试流程独立脚本**：单一职责，便于单独运行和调试
- **脚本命名清晰**：`scripts/test-download-<场景>.js`
- **支持参数化**：可通过参数指定数量等
- **输出结果明确**：每个脚本输出测试结果和日志

### 1. 本地下载到本地R2
**脚本：** `scripts/test-download-local-to-local.js`

**功能：**
- 读取本地D1待下载列表（通过本地Worker API或直接使用 `wrangler d1 execute --local`）
- 下载音频文件到本地临时目录
- 上传到本地R2（通过本地Worker API，需要先启动 `pnpm dev:backend:local`）
- 更新本地D1状态

**命令：**
```bash
# 需要先启动本地Worker
pnpm dev:backend:local
# 然后在另一个终端运行
pnpm test:download:local-to-local
```

**参数：**
- `--limit <number>` - 限制下载数量（默认：1）

**配置来源：** 从 `.env` 文件读取配置（本地模式时使用本地Worker地址 `http://localhost:8787`）

**适用场景：** 本地完整流程测试

### 2. 本地下载到线上R2
**脚本：** `scripts/test-download-local-to-remote.js`

**功能：**
- 读取本地D1待下载列表（通过本地Worker API或直接使用 `wrangler d1 execute --local`）
- 下载音频文件到本地临时目录
- 上传到线上R2（需要wrangler已登录，使用 `wrangler r2 object put` 或通过Worker API）
- 更新本地D1状态

**命令：**
```bash
pnpm test:download:local-to-remote
```

**参数：**
- `--limit <number>` - 限制下载数量（默认：1）

**配置来源：** 从 `.env` 文件读取配置（`R2_BUCKET_NAME`、`D1_DATABASE_NAME`等）

**适用场景：** 测试下载和上传功能，但使用本地数据库

### 3. 线上下载到线上R2
**脚本：** `scripts/test-download-remote-to-remote.js`

**功能：**
- 读取线上D1待下载列表（通过Worker API）
- 下载音频文件到本地临时目录
- 上传到线上R2（需要wrangler已登录，使用 `wrangler r2 object put` 或通过Worker API）
- 更新线上D1状态（通过Worker API）

**命令：**
```bash
pnpm test:download:remote-to-remote
```

**参数：**
- `--limit <number>` - 限制下载数量（默认：1）

**配置来源：** 从 `.env` 文件读取配置（`WORKER_URL`、`R2_BUCKET_NAME`、`D1_DATABASE_NAME`等）

**适用场景：** 完整线上环境测试，模拟生产环境

### 4. GitHub Action 下载流程
**脚本：** `scripts/download_worker.py`（已在GitHub Actions中使用）

**功能：**
- 读取线上D1待下载列表（通过Worker API）
- 下载音频文件
- 上传到线上R2
- 更新线上D1状态（通过Worker API）

**触发方式：**
- GitHub Actions workflow: `.github/workflows/download-audio.yml`
- 手动触发：GitHub Actions UI 或 API
- 自动触发：通过Worker API调用（如果配置）

**参数：**（通过环境变量配置）
- `WORKER_URL` - Worker API地址
- `R2_BUCKET_NAME` - R2 bucket名称
- `CLOUDFLARE_API_TOKEN` - Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare Account ID

**适用场景：** 生产环境自动下载流程

## 测试脚本组织

### 目录结构
```
scripts/
├── init.js                            # 初始化脚本
├── deploy.js                          # 部署脚本
├── test-download-local-to-local.js    # 本地D1 → 本地R2
├── test-download-local-to-remote.js   # 本地D1 → 线上R2
├── test-download-remote-to-remote.js  # 线上D1 → 线上R2
└── download_worker.py                 # GitHub Action使用（已存在）
```

### package.json 脚本命令
```json
{
  "scripts": {
    "init": "node scripts/init.js",
    "deploy": "node scripts/deploy.js",
    "dev:local": "concurrently \"pnpm dev:backend:local\" \"pnpm dev:frontend\"",
    "dev:local:remote": "concurrently \"pnpm dev:backend:remote\" \"pnpm dev:frontend\"",
    "dev:backend": "cd backend && wrangler dev --local",
    "dev:backend:local": "cd backend && wrangler dev --local",
    "dev:backend:remote": "cd backend && wrangler dev --remote",
    "dev:frontend": "cd frontend && npm run dev",
    "test:download:local-to-local": "node scripts/test-download-local-to-local.js",
    "test:download:local-to-remote": "node scripts/test-download-local-to-remote.js",
    "test:download:remote-to-remote": "node scripts/test-download-remote-to-remote.js"
  }
}
```

### 脚本参数总结

#### 初始化脚本 (`scripts/init.js`)
- `--skip-deps` - 跳过依赖安装
- `--skip-db-init` - 跳过数据库初始化

#### 部署脚本 (`scripts/deploy.js`)
- `--skip-frontend` - 跳过前端部署
- `--skip-backend` - 跳过后端部署
- `--dry-run` - 干运行，只验证不实际部署

#### 下载测试脚本（3个脚本通用）
- `--limit <number>` - 限制下载数量（默认：1）

### 统一测试工具规范
- 使用 Node.js 编写测试脚本（便于跨平台和与后端集成）
- 统一的日志输出格式（使用 `console.log` 带emoji标识）
- 统一的错误处理和结果报告
- 支持 `--help` 查看使用说明

