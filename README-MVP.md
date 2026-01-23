# B-Cast MVP

> 最小可行产品版本 - 用于测试B站URL解析和音频下载能力

## 🎯 MVP功能范围

### ✅ 包含功能
- B站URL解析（支持UP主空间、合集、单个视频）
- 播放列表管理（添加、查看、删除）
- 下载队列管理
- GitHub Actions音频下载
- R2音频存储
- 简单的测试播放功能

### ❌ 不包含功能
- 登录/认证（直接公开访问）
- 完整播放器（无历史记录、进度保存）
- 自动定时任务
- 播放列表自动更新

## 📚 文档

- **[MVP设计文档](./docs/mvp-design.md)** - 详细的技术设计和实现方案
- **[MVP部署清单](./docs/mvp-deployment-checklist.md)** - 一步步部署指南
- **[完整版技术设计](./docs/technical-design.md)** - 未来升级参考

## 🚀 快速开始

### 前置要求

- Node.js 18+
- Cloudflare账号（免费版足够）
- GitHub账号
- wrangler CLI: `npm install -g wrangler`

### 30秒快速部署

```bash
# 1. 创建D1数据库
wrangler d1 create b-cast-mvp
# 记录 database_id

# 2. 初始化数据库
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql

# 3. 创建R2存储
wrangler r2 bucket create b-cast-audio

# 4. 配置backend/wrangler.toml中的database_id

# 5. 部署后端
cd backend && wrangler deploy

# 6. 配置前端环境变量（见docs/mvp-deployment-checklist.md）

# 7. 部署前端
cd frontend && npm run build && wrangler pages deploy dist

# 8. 配置GitHub Secrets（见部署清单）

# 9. 完成！
```

详细步骤请参考 **[部署清单](./docs/mvp-deployment-checklist.md)**

## 🧪 测试

### 测试B站解析

```bash
curl -X POST https://your-worker.workers.dev/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/3493085779869"}' | jq
```

### 触发下载

1. 前往 GitHub仓库 > Actions
2. 选择 "Download Audio (MVP)" workflow
3. 点击 "Run workflow"

## 📁 项目结构

```
b-cast/
├── frontend/              # Vite + React前端
│   ├── src/
│   │   ├── components/   # UI组件
│   │   ├── pages/        # 页面
│   │   ├── db.ts         # IndexedDB配置
│   │   └── utils/        # 工具函数
│   └── package.json
│
├── backend/              # Cloudflare Workers后端
│   ├── src/
│   │   ├── routes/      # API路由
│   │   └── services/    # B站解析服务
│   ├── wrangler.toml    # 需要配置database_id
│   └── package.json
│
├── scripts/
│   ├── download_queue.sql    # D1数据库Schema
│   └── download_worker.py    # GitHub Actions下载脚本
│
├── .github/workflows/
│   └── download-audio.yml    # GitHub Actions配置
│
└── docs/
    ├── mvp-design.md              # MVP设计文档
    └── mvp-deployment-checklist.md # 部署清单
```

## 🔧 技术栈

### 前端
- React 18
- TypeScript
- Vite
- Dexie.js (IndexedDB)
- TailwindCSS

### 后端
- Cloudflare Workers
- Hono (Web框架)
- Cloudflare D1 (数据库)
- Cloudflare R2 (对象存储)

### 下载Worker
- GitHub Actions
- Python 3.11
- yt-dlp (B站下载)
- boto3 (R2上传)

## 💡 使用示例

### 1. 添加UP主的所有视频

```
输入URL: https://space.bilibili.com/12345678
```

### 2. 添加合集

```
输入URL: https://space.bilibili.com/12345678/channel/collectiondetail?sid=789
```

### 3. 添加单个视频

```
输入URL: https://www.bilibili.com/video/BV1xx4y1x7xx
```

## 🐛 故障排查

### 解析失败
- 检查URL格式是否正确
- 查看浏览器Console错误
- B站可能有限流，稍后重试

### 下载失败
- 检查GitHub Actions日志
- 验证Secrets配置
- 查看D1数据库中的error_message

### 音频无法播放
- 检查R2公开访问是否开启
- 验证audioUrl格式
- 查看浏览器Network请求

更多问题参考：[部署清单 - 常见问题](./docs/mvp-deployment-checklist.md#-常见问题)

## 📊 成本估算

基于Cloudflare免费计划，MVP完全免费：

| 资源 | 免费额度 | MVP预估 |
|------|---------|--------|
| Workers | 10万请求/天 | < 1000 |
| D1存储 | 5GB | < 10MB |
| D1读取 | 500万/天 | < 1万 |
| R2存储 | 10GB | ~5GB |
| R2下载 | 10GB/月 | < 5GB |
| GitHub Actions | 2000分钟/月 | < 200 |

## 🔄 后续升级

完成MVP后可以升级为完整版：

- [ ] 添加Token认证
- [ ] 完整播放器（历史、进度）
- [ ] 自动定时任务
- [ ] PWA离线支持
- [ ] Media Session API

参考：[完整版技术设计](./docs/technical-design.md)

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📞 支持

- 📖 查看 [设计文档](./docs/mvp-design.md)
- 📋 参考 [部署清单](./docs/mvp-deployment-checklist.md)
- 🐛 提交 [Issue](https://github.com/YOUR_USERNAME/B-Cast/issues)

---

**开发时间：** 2-3天  
**适用场景：** 快速验证，个人测试  
**下一步：** 跟随部署清单开始部署吧！
