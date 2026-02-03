# B-Cast

开源的个人 PWA 音频播放器，支持从 B 站自动下载和管理音频内容。

---

## 如何部署

适合 Fork 到自己的仓库后，用 Cloudflare Workers + D1 + R2 + GitHub Actions 部署，敏感信息仅存于本地 `.env` 与 GitHub Secrets，不进入代码仓库。

### 1. Fork 并克隆

Fork 本仓库到你的 GitHub 账号，克隆到本地：

```bash
git clone https://github.com/<你的用户名>/B-Cast.git
cd B-Cast
```

### 2. 登录 Cloudflare

在终端执行（会打开浏览器完成登录）：

```bash
cd backend && pnpm exec wrangler login
cd ..
```

需使用已开通 Workers / D1 / R2 的 Cloudflare 账号（免费套餐即可）。若从未用过 R2，在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 的 R2 页面点一次即可“开通”，无需事先手动建 Bucket。

### 3. 安装依赖

```bash
pnpm install
cd backend && pnpm install && cd ..
cd frontend && npm install && cd ..
```

### 4. 初始化（生成本地配置）

```bash
pnpm init
```

脚本会依次：

- 创建 D1 数据库（可回车用默认名 `b-cast`）
- 创建 R2 Bucket（可回车用默认名 `b-cast`）
- 初始化远程数据库表结构
- 首次部署 Worker 并得到访问地址
- 将 **D1_DATABASE_NAME**、**D1_DATABASE_ID**、**R2_BUCKET_NAME**、**WORKER_URL** 写入项目根目录的 `.env` 文件
- **GITHUB_REPO**：根据当前仓库的 `git remote origin` 自动写入（格式 `owner/repo`）；若无 git 或解析失败会提示输入，可留空稍后填

结束时会在终端打印需要填写的 **GitHub Secrets** 列表，请先不要关掉终端，下一步要用。

**触发下载（可选）**：若希望「访问 Worker 链接即触发下载」（`/api/downloads/trigger-download`），还需在 `.env` 中配置 **GITHUB_TOKEN**：

1. 在 GitHub 创建 Personal Access Token：**Settings → Developer settings → Personal access tokens → Generate new token**
2. 勾选权限 **`actions: write`**（用于触发 download-audio workflow）
3. 在项目根目录 `.env` 中新增一行：`GITHUB_TOKEN=你的token`  
   （不要提交 `.env`；部署时脚本会把该值写入 Worker 的 secret，供触发接口使用）

### 5. 配置 GitHub Secrets

**仅在你使用 GitHub Actions 时**（例如 push 触发部署、或运行「下载音频」workflow）才需要配置；若只在本机用 `pnpm deploy` 部署，可跳过本节。

到你的 Fork 仓库：**Settings → Secrets and variables → Actions**，新建以下 Secret：

| 名称 | 说明 | 从哪里取 |
|------|------|----------|
| `CLOUDFLARE_API_TOKEN` | CF API 令牌（**仅 Actions 需要**） | [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建，权限需包含：Workers 编辑、D1 编辑、R2 编辑 |
| `CLOUDFLARE_ACCOUNT_ID` | CF 账号 ID（**仅 Actions 需要**） | Dashboard 右侧栏 Account ID |
| `D1_DATABASE_NAME` | D1 数据库名 | 复制 `.env` 里的值（如 `b-cast`） |
| `D1_DATABASE_ID` | D1 数据库 UUID | 复制 `.env` 里的值 |
| `R2_BUCKET_NAME` | R2 Bucket 名 | 复制 `.env` 里的值（如 `b-cast`） |
| `WORKER_URL` | Worker 域名（不含 `https://`） | 复制 `.env` 里的值（如 `b-cast.xxx.workers.dev`） |

若使用 **GitHub Actions 部署**且希望 Worker 能「访问链接即触发下载」，再增加（可选）：

| 名称 | 说明 |
|------|------|
| `TRIGGER_ACTION_TOKEN` | 你的 GitHub PAT（勾选 `actions: write`），部署时会写入 Worker 的 GITHUB_TOKEN secret |

（GITHUB_REPO 在 CI 中会使用 `github.repository` 自动注入，无需单独配置。）

如需使用「自动下载 B 站音频」的 GitHub Action，再增加（可选）：

| 名称 | 说明 |
|------|------|
| `BILIBILI_SESSDATA` | B 站登录后的 Cookie 中的 SESSDATA（用于下载需登录的稿件） |

**注意**：`CLOUDFLARE_API_TOKEN` 不要写入 `.env`，只放在 GitHub Secrets 中，供 Actions 使用；本地部署用 `wrangler login`，不需要 API Token。

### 6. 执行部署

部署前会检查 `.env` 是否含 **GITHUB_REPO**、**GITHUB_TOKEN**；缺则仅提示，不阻断部署。部署时会根据 `.env` 生成 Worker 配置（含 GITHUB_REPO），若存在 GITHUB_TOKEN 会通过 `wrangler secret put` 写入 Worker，供 `/api/downloads/trigger-download` 使用。

任选其一：

- **命令行部署（推荐先做一次）**  
  ```bash
  pnpm deploy
  ```  
  会按当前 `.env` 部署 Worker，并把前端一起打包部署到该 Worker 域名下。

- **之后用 GitHub Actions 部署**  
  把代码推送到 `main` 分支（例如 `git push origin main`），会触发仓库内的 workflow，用上述 Secrets 部署 Worker，并把前端部署到 GitHub Pages。

部署完成后，用浏览器打开 Worker 的 URL（或 GitHub Pages 的地址，若你配置了）即可使用前端。

---

### 公开仓库与安全

- `.env`、`backend/wrangler.toml`、`.dev.vars` 已在 `.gitignore` 中，**不会被提交**。
- 敏感信息只存在于：  
  - 你本机的 `.env`  
  - 仓库的 GitHub Secrets（仅你自己可见）  
- 因此 **Fork 为公开仓库不会泄露密钥**，只要不把 `.env` 或含密钥的文件加入版本库即可。若误提交过 `.env`，需在历史中删除并轮换所有已暴露的 Token。
