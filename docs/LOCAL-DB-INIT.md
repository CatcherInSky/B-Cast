# 本地开发环境初始化指南

## 问题：D1_ERROR: no such table: subscriptions

这是因为本地D1数据库还没有初始化表结构。

---

## ✅ 解决方案：初始化本地D1数据库

### 方法1: 使用快速初始化脚本（推荐）

```bash
cd backend
./init-local-db.sh
```

这个脚本会自动：
- ✅ 检查环境
- ✅ 执行SQL创建表
- ✅ 创建索引

### 方法2: 手动执行SQL

```bash
cd backend

# 初始化数据库
wrangler d1 execute b-cast-mvp --local --file=../scripts/init-db.sql
```

### 方法3: 逐个表创建

```bash
cd backend

# 创建订阅表
wrangler d1 execute b-cast-mvp --local --file=../scripts/subscriptions.sql

# 创建下载队列表
wrangler d1 execute b-cast-mvp --local --file=../scripts/download_queue.sql
```

---

## 🚀 完整的首次启动流程

### 1. 安装依赖

```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend
npm install
```

### 2. 初始化本地D1数据库

```bash
cd backend
./init-local-db.sh
```

### 3. 启动开发服务器

```bash
# Terminal 1: Backend
cd backend
pnpm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

### 4. 访问应用

- Frontend: http://localhost:5173
- Backend API: http://localhost:8787

---

## 🔍 验证数据库初始化

### 检查表是否创建成功

```bash
cd backend

# 查看所有表
wrangler d1 execute b-cast-mvp --local --command "SELECT name FROM sqlite_master WHERE type='table';"

# 应该看到：
# subscriptions
# subscription_items
# download_queue
```

### 查看表结构

```bash
# 查看subscriptions表结构
wrangler d1 execute b-cast-mvp --local --command "PRAGMA table_info(subscriptions);"

# 查看subscription_items表结构
wrangler d1 execute b-cast-mvp --local --command "PRAGMA table_info(subscription_items);"

# 查看download_queue表结构
wrangler d1 execute b-cast-mvp --local --command "PRAGMA table_info(download_queue);"
```

---

## 📂 本地D1数据库文件位置

```
backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
```

你可以使用sqlite3工具直接查看：

```bash
cd backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/
sqlite3 *.sqlite

# SQLite命令
.tables           # 查看所有表
.schema           # 查看完整的表结构
SELECT * FROM subscriptions;  # 查询数据
.exit             # 退出
```

---

## 🔄 重置本地数据库

如果需要清空并重新初始化：

```bash
cd backend

# 删除本地数据库
rm -rf .wrangler/state/v3/d1/

# 重新初始化
./init-local-db.sh

# 重启开发服务器
pnpm run dev
```

---

## ⚠️ 为什么不能跳过D1？

D1是整个应用的核心存储，用于：

1. **存储订阅信息** - subscriptions表
2. **记录视频列表** - subscription_items表
3. **管理下载队列** - download_queue表
4. **追踪下载状态** - status字段
5. **生成RSS** - 从D1读取数据生成XML

**如果跳过D1：**
- ❌ 无法保存订阅
- ❌ 无法生成RSS
- ❌ 无法管理下载
- ❌ 应用完全无法工作

**正确做法是：**
✅ 初始化本地D1数据库
✅ 本地开发使用本地D1
✅ 生产环境使用真实D1

---

## 🎯 数据库表说明

### 1. subscriptions（订阅表）

存储RSS订阅的元数据：
- 订阅ID、名称、类型
- B站URL、RSS URL
- UP主信息、封面、描述
- 最后检查时间、最新视频信息
- 是否启用自动更新

### 2. subscription_items（订阅项目表）

存储每个订阅中的视频：
- 视频ID (BVID)、标题、时长、封面
- 发布时间
- 关联的下载队列ID

### 3. download_queue（下载队列表）

管理音频下载任务：
- 视频ID、标题
- 下载状态 (pending/downloading/completed/failed)
- 音频URL、文件大小
- 重试次数、错误信息

---

## 🐛 常见问题

### Q: 初始化脚本没有执行权限？

```bash
chmod +x backend/init-local-db.sh
```

### Q: wrangler命令找不到？

```bash
npm install -g wrangler
```

### Q: 数据库初始化失败？

检查：
1. 是否在backend目录下执行
2. wrangler.toml配置是否正确
3. database_id是否正确

### Q: 重新初始化后数据丢失？

本地开发数据存储在 `.wrangler/` 目录：
- 删除该目录会清空所有数据
- 生产环境的数据不受影响
- 建议定期导出重要的测试数据

---

## 📚 相关文档

- [本地测试指南](./LOCAL-TESTING.md)
- [数据链路与测试](./DATA-FLOW-TESTING.md)
- [RSS地址获取](./RSS-LOCATION.md)

---

## 🎉 初始化成功的标志

执行完初始化脚本后，运行 `pnpm run dev`，你应该能：

✅ 成功启动开发服务器
✅ 在前端添加订阅
✅ 看到订阅保存成功的日志
✅ 访问RSS地址获取XML内容
✅ 查询下载队列

现在就可以愉快地开发了！🚀
