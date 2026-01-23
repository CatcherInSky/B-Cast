# B-Cast MVP

> 开源的个人PWA音频播放器，支持从B站自动下载和管理音频内容

![MVP Version](https://img.shields.io/badge/version-0.1.0--mvp-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 MVP功能

这是B-Cast的最小可行产品（MVP）版本，专注于核心功能验证：

### ✅ 已实现
- **B站URL解析** - 支持UP主空间、合集、单个视频
- **播放列表管理** - 添加、查看、删除播放列表
- **下载队列管理** - 自动添加到下载队列
- **GitHub Actions下载** - 手动触发音频下载
- **R2音频存储** - Cloudflare R2对象存储
- **简单播放测试** - 验证音频下载是否成功

### ❌ 未包含（完整版功能）
- 用户登录认证
- 完整播放器（历史记录、进度保存）
- 自动定时下载
- PWA离线支持
- Media Session API

## 🚀 快速开始

### 方式A：Fork后一键部署（推荐，仅3步）

**适合：** Fork后直接使用，最简单

1. **Fork本仓库** - 点击右上角"Fork"按钮

2. **配置Secrets** - 进入 `Settings` > `Secrets` > `Actions`，添加：
   - `CLOUDFLARE_API_TOKEN` - [创建Token](https://dash.cloudflare.com/profile/api-tokens)
   - `CLOUDFLARE_ACCOUNT_ID` - 从Dashboard URL获取

3. **运行部署** - 进入 `Actions` > "🚀 Setup and Deploy" > "Run workflow" > "full-setup"

**等待5分钟，完成！** 🎉

> 详细说明：[Fork后一键部署指南](./docs/one-click-fork-deploy.md)

---

### 方式B：本地开发部署

**适合：** 需要本地开发和自定义

#### 前置要求

- Node.js 18+
- Cloudflare账号（免费版足够）
- GitHub账号
- wrangler CLI: `npm install -g wrangler`

#### 1. Fork和Clone

```bash
git clone https://github.com/YOUR_USERNAME/B-Cast.git
cd B-Cast
```

### 2. 配置Cloudflare

**方式A：自动初始化（推荐）**

```bash
# 登录Cloudflare
wrangler login

# 一键初始化（自动创建D1、R2并更新配置）
npm run init
```

**方式B：手动创建**

```bash
# 登录Cloudflare
wrangler login

# 创建D1数据库
wrangler d1 create b-cast-mvp
# 记录输出的 database_id

# 初始化数据库
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql

# 创建R2存储桶
wrangler r2 bucket create b-cast-audio
```

### 3. 配置后端

如果使用自动初始化（方式A），此步骤已自动完成，可跳过。

如果使用手动创建（方式B），编辑 `backend/wrangler.toml`，填入你的 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "b-cast-mvp"
database_id = "your-database-id-here"  # 填入这里
```

### 4. 部署

**方式A：一键部署（推荐）**

```bash
npm run deploy
# 自动部署后端和前端
```

**方式B：手动分步部署**

```bash
# 部署后端
cd backend
npm install
wrangler deploy
# 记录部署URL: https://b-cast-mvp.xxx.workers.dev

# 部署前端
cd ../frontend
npm install
npm run build
wrangler pages deploy dist --project-name=b-cast-mvp
```

### 5. 配置GitHub Actions（可选）

如果使用自动化部署，在GitHub仓库配置Secrets：

```
Settings > Secrets and variables > Actions

添加:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- VITE_API_BASE (可选)
```

配置后，每次推送到main分支会自动部署。

### 6. 配置GitHub Secrets（用于下载功能）

在GitHub仓库 Settings > Secrets and variables > Actions 中添加：

- `R2_ENDPOINT`
- `R2_ACCESS_KEY`
- `R2_SECRET_KEY`
- `R2_BUCKET`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN`

详细步骤见：[MVP部署清单](./docs/mvp-deployment-checklist.md)

### 7. 测试

1. 访问前端URL
2. 输入B站URL添加播放列表
3. 前往 GitHub Actions 手动触发下载
4. 查看下载状态，测试播放

## 📚 文档

- **[MVP设计文档](./docs/mvp-design.md)** - 详细的技术设计
- **[MVP部署清单](./docs/mvp-deployment-checklist.md)** - 逐步部署指南
- **[环境变量配置](./docs/mvp-environment-setup.md)** - 配置说明
- **[MVP vs 完整版](./docs/mvp-vs-full-comparison.md)** - 功能对比
- **[完整版技术设计](./docs/technical-design.md)** - 未来升级参考

## 🏗️ 项目结构

```
b-cast/
├── frontend/              # Vite + React前端
│   ├── src/
│   │   ├── components/   # UI组件
│   │   ├── pages/        # 页面
│   │   ├── utils/        # 工具函数
│   │   └── db.ts         # IndexedDB
│   └── package.json
│
├── backend/              # Cloudflare Workers后端
│   ├── src/
│   │   ├── routes/      # API路由
│   │   ├── services/    # B站解析
│   │   └── types/       # 类型定义
│   ├── wrangler.toml    # Worker配置
│   └── package.json
│
├── scripts/
│   ├── download_queue.sql    # D1 Schema
│   └── download_worker.py    # 下载脚本
│
├── .github/workflows/
│   └── download-audio.yml    # GitHub Actions
│
└── docs/                 # 文档
```

## 🔧 本地开发

### 后端开发

```bash
cd backend
npm install
wrangler dev --local  # localhost:8787
```

### 前端开发

```bash
cd frontend
npm install
npm run dev  # localhost:5173
```

前端会自动代理API请求到 `localhost:8787`

## 🧪 测试

### 测试B站解析

```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/3493085779869"}' | jq
```

### 测试下载队列

```bash
# 查看队列
curl http://localhost:8787/api/downloads/list | jq

# 添加到队列
curl -X POST http://localhost:8787/api/downloads/queue \
  -H "Content-Type: application/json" \
  -d '{"items":[{"bvid":"BV1xx4y1x7xx","title":"测试","duration":180}]}' | jq
```

## 💡 使用示例

### 1. 添加UP主的所有视频

```
输入: https://space.bilibili.com/12345678
结果: 解析UP主最近30个视频
```

### 2. 添加合集

```
输入: https://space.bilibili.com/12345678/channel/collectiondetail?sid=789
结果: 解析合集中所有视频
```

### 3. 添加单个视频

```
输入: https://www.bilibili.com/video/BV1xx4y1x7xx
结果: 添加该视频到播放列表
```

## 🐛 故障排查

### 解析失败

- 检查URL格式
- 查看浏览器Console
- B站可能限流，稍后重试

### 下载失败

- 检查GitHub Actions日志
- 验证Secrets配置
- 查看D1数据库error_message字段

### 音频无法播放

- 检查R2公开访问是否开启
- 验证audioUrl格式
- 查看浏览器Network请求

更多问题参考：[部署清单 - 常见问题](./docs/mvp-deployment-checklist.md#-常见问题)

## 📊 成本估算

基于Cloudflare免费计划，MVP**完全免费**：

| 资源 | 免费额度 | MVP预估 |
|------|---------|---------|
| Workers | 10万请求/天 | < 1000 |
| D1存储 | 5GB | < 10MB |
| D1读取 | 500万/天 | < 1万 |
| R2存储 | 10GB | ~5GB |
| GitHub Actions | 2000分钟/月 | < 200 |

## 🔄 升级到完整版

MVP完成后，可以升级为完整版，详见：[完整版技术设计](./docs/technical-design.md)

升级路径：

1. **Phase 1**: 添加认证、完整播放器 (1-2天)
2. **Phase 2**: PWA支持、自动任务 (2-3天)
3. **Phase 3**: 性能优化、高级功能 (持续)

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

## 🙏 致谢

- [RSSHub](https://github.com/DIYgod/RSSHub) - B站API参考
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 视频下载工具
- [Cloudflare](https://www.cloudflare.com/) - 基础设施
- [Hono](https://hono.dev/) - Web框架
- [Dexie.js](https://dexie.org/) - IndexedDB库

---

**开发时间：** 2-3天  
**适用场景：** 快速验证，个人测试  
**下一步：** 跟随 [部署清单](./docs/mvp-deployment-checklist.md) 开始部署吧！
