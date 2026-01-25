# 🚀 快速开始 - 本地开发

## ⚡ 一次性设置（首次运行）

```bash
# 1. 安装依赖
cd backend && pnpm install
cd ../frontend && npm install

# 2. 初始化本地数据库（重要！）
cd ../backend
pnpm exec wrangler d1 execute b-cast-mvp --local --file=../scripts/init-db.sql

# 或使用便捷脚本
./init-local-db.sh
```

---

## 🔄 日常开发（每次启动）

```bash
# Terminal 1: 启动Backend
cd backend
pnpm run dev
# ✅ http://localhost:8787

# Terminal 2: 启动Frontend
cd frontend
npm run dev
# ✅ http://localhost:5173
```

---

## 📋 快速命令参考

### 初始化数据库
```bash
cd backend
pnpm exec wrangler d1 execute b-cast-mvp --local --file=../scripts/init-db.sql
```

### 查看所有表
```bash
cd backend
pnpm exec wrangler d1 execute b-cast-mvp --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### 查看表数据
```bash
cd backend
# 查看订阅
pnpm exec wrangler d1 execute b-cast-mvp --local --command "SELECT * FROM subscriptions;"

# 查看下载队列
pnpm exec wrangler d1 execute b-cast-mvp --local --command "SELECT * FROM download_queue;"
```

### 重置本地数据库
```bash
cd backend
rm -rf .wrangler/state/v3/d1/
pnpm exec wrangler d1 execute b-cast-mvp --local --file=../scripts/init-db.sql
```

---

## 🧪 测试API

### 添加订阅
```bash
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/437316738"}'
```

### 查看订阅列表
```bash
curl http://localhost:8787/api/subscriptions/list | jq
```

### 查看下载队列
```bash
curl http://localhost:8787/api/downloads/list | jq
```

### 手动触发订阅更新
```bash
curl -X POST http://localhost:8787/api/cron/check-updates | jq
```

---

## ⚠️ 常见错误

### ❌ D1_ERROR: no such table: subscriptions

**原因：** 本地D1未初始化

**解决：**
```bash
cd backend
pnpm exec wrangler d1 execute b-cast-mvp --local --file=../scripts/init-db.sql
```

### ❌ RSS feed not found (404)

**原因：** 前端使用了旧的API，没有创建RSS

**解决：**
1. 重启backend服务器（加载新代码）
2. 重新添加订阅（会自动创建RSS）

### ❌ command not found: wrangler

**解决：**
```bash
# 方式1: 使用pnpm exec
pnpm exec wrangler ...

# 方式2: 全局安装
npm install -g wrangler
```

---

## 📂 本地文件位置

```
backend/
  .wrangler/
    state/
      v3/
        d1/           ← SQLite数据库文件
        r2/           ← R2存储模拟（包含RSS文件）
          b-cast-audio/
            rss/      ← RSS XML文件
```

---

## ✅ 验证清单

启动成功后，应该能够：

- [ ] Backend在8787端口运行
- [ ] Frontend在5173端口运行
- [ ] 前端可以添加B站URL
- [ ] 后端日志显示"保存RSS到R2"
- [ ] 播放列表卡片显示RSS地址
- [ ] 可以复制RSS地址
- [ ] 访问RSS地址返回XML内容

---

## 🆘 需要帮助？

查看详细文档：
- [本地数据库初始化](./LOCAL-DB-INIT.md)
- [本地测试指南](./LOCAL-TESTING.md)
- [RSS地址获取](./RSS-LOCATION.md)
- [数据链路测试](./DATA-FLOW-TESTING.md)
