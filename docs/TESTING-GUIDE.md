# B-Cast 测试指南

## 🧪 测试环境

### 本地开发环境

**Backend:**
```bash
cd backend
pnpm dev
# 运行在 http://localhost:8787
```

**Frontend:**
```bash
cd frontend
pnpm dev
# 运行在 http://localhost:5173
```

---

## 📝 测试用例

### 1. UP主空间测试

#### 测试1.1: 大UP主（老番茄）

**URL:**
```
https://space.bilibili.com/2267573
```

**cURL测试:**
```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/2267573"}'
```

**预期结果:**
```json
{
  "success": true,
  "method": "wbi",
  "data": {
    "playlist": {
      "name": "老番茄的投稿",
      "type": "uploader",
      "uploaderName": "老番茄",
      "cover": "...",
      "description": "老番茄的bilibili空间"
    },
    "items": [
      {
        "bvid": "BVxxx",
        "title": "视频标题",
        "duration": 123,
        "cover": "...",
        "pubDate": 1234567890000
      }
      // ... 更多视频
    ]
  }
}
```

**检查点:**
- ✅ `success: true`
- ✅ `method: "wbi"` 或 `"simplified-fallback"`
- ✅ `items` 数组包含视频
- ✅ 每个视频有 `bvid`, `title`, `duration`

---

#### 测试1.2: 小UP主

**URL:**
```
https://space.bilibili.com/546195
```

**检查点:**
- ✅ 能够成功解析
- ✅ 返回视频列表
- ✅ WBI签名工作正常

---

### 2. 合集测试

#### 测试2.1: 标准合集

**URL:**
```
https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166
```

**cURL测试:**
```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166"}'
```

**预期结果:**
```json
{
  "success": true,
  "method": "simplified",
  "data": {
    "playlist": {
      "name": "合集名称",
      "type": "collection",
      ...
    },
    "items": [...]
  }
}
```

**检查点:**
- ✅ `method: "simplified"`（合集不需要WBI）
- ✅ 返回合集信息
- ✅ 视频列表完整

---

### 3. 单视频测试

#### 测试3.1: 标准视频

**URL:**
```
https://www.bilibili.com/video/BV1xx411c7mu
```

**cURL测试:**
```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.bilibili.com/video/BV1xx411c7mu"}'
```

**预期结果:**
```json
{
  "success": true,
  "method": "simplified",
  "data": {
    "playlist": {
      "name": "视频标题",
      "type": "collection",
      ...
    },
    "items": [{
      "bvid": "BV1xx411c7mu",
      ...
    }]
  }
}
```

---

## 🔍 前端集成测试

### 测试流程

#### 1. 添加播放列表

**步骤:**
1. 打开 http://localhost:5173
2. 点击 "添加播放列表"
3. 输入B站URL
4. 点击 "添加"

**测试URL:**
```
https://space.bilibili.com/2267573
https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166
https://www.bilibili.com/video/BV1xx411c7mu
```

**检查点:**
- ✅ Loading状态显示
- ✅ 成功后显示播放列表
- ✅ 视频列表正确渲染
- ✅ 封面图片加载
- ✅ 数据保存到IndexedDB

---

#### 2. 查看播放列表

**检查点:**
- ✅ 显示所有已添加的播放列表
- ✅ 卡片样式正确
- ✅ UP主名称显示
- ✅ 视频数量统计

---

#### 3. 删除播放列表

**检查点:**
- ✅ 删除按钮工作
- ✅ 确认对话框（可选）
- ✅ IndexedDB数据清除
- ✅ UI更新

---

## 🐛 错误处理测试

### 测试4.1: 无效URL

**输入:**
```
https://www.google.com
```

**预期:**
```json
{
  "success": false,
  "error": "不支持的URL类型"
}
```

---

### 测试4.2: 不存在的UP主

**输入:**
```
https://space.bilibili.com/999999999999
```

**预期:**
```json
{
  "success": false,
  "error": "获取UP主信息失败: ..."
}
```

---

### 测试4.3: 网络错误

**模拟:**
```bash
# 关闭网络
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/2267573"}'
```

**检查:**
- ✅ 返回友好的错误信息
- ✅ 前端显示错误提示
- ✅ 不会崩溃

---

## 📊 性能测试

### 测试5.1: WBI Keys缓存

**步骤:**
1. 第一次请求UP主空间
2. 查看console：`Fetching WBI keys...`
3. 第二次请求（10分钟内）
4. 查看console：`Using cached WBI keys`

**检查点:**
- ✅ 第一次获取WBI keys
- ✅ 后续请求使用缓存
- ✅ 10分钟后重新获取

---

### 测试5.2: 并发请求

**测试脚本:**
```bash
# 同时发送10个请求
for i in {1..10}; do
  curl -X POST http://localhost:8787/api/bilibili/parse \
    -H "Content-Type: application/json" \
    -d '{"url": "https://space.bilibili.com/2267573"}' &
done
wait
```

**检查点:**
- ✅ 所有请求都成功
- ✅ 无race condition
- ✅ WBI keys缓存正常工作

---

## 🔄 Fallback机制测试

### 测试6.1: WBI失败回退

**模拟WBI失败:**
修改 `bilibili-wbi.ts`，让 `getWbiKeys()` 抛出错误

**预期:**
- ✅ 自动尝试简化方案
- ✅ 返回 `method: "simplified-fallback"`
- ✅ 仍能获取数据（如果简化方案支持）

---

## ✅ 完整测试检查清单

### Backend API

- [ ] UP主空间解析（WBI方案）
- [ ] UP主空间解析（Fallback方案）
- [ ] 合集解析
- [ ] 单视频解析
- [ ] WBI Keys获取和缓存
- [ ] 错误处理（无效URL）
- [ ] 错误处理（网络错误）
- [ ] 错误处理（API错误）

### Frontend

- [ ] 添加UP主空间URL
- [ ] 添加合集URL
- [ ] 添加单视频URL
- [ ] 显示播放列表
- [ ] 显示视频列表
- [ ] 删除播放列表
- [ ] 错误提示显示
- [ ] Loading状态
- [ ] IndexedDB存储

### 集成

- [ ] Frontend → Backend API调用
- [ ] 数据正确渲染
- [ ] 封面图片加载
- [ ] 完整的用户流程

---

## 🚀 生产环境测试

### 部署后测试

```bash
# 替换为你的实际部署URL
API_URL="https://your-worker.workers.dev"

# 测试UP主空间
curl -X POST $API_URL/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/2267573"}'

# 测试合集
curl -X POST $API_URL/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166"}'
```

**检查点:**
- ✅ API响应正常
- ✅ CORS配置正确
- ✅ D1数据库连接
- ✅ R2存储访问

---

## 📝 测试报告模板

```markdown
# 测试报告 - [日期]

## 测试环境
- Backend: [URL]
- Frontend: [URL]
- 浏览器: [版本]

## 测试结果

### UP主空间
- [ ] 大UP主: ✅ / ❌
- [ ] 小UP主: ✅ / ❌
- [ ] WBI签名: ✅ / ❌

### 合集
- [ ] 标准合集: ✅ / ❌

### 单视频
- [ ] 标准视频: ✅ / ❌

### 错误处理
- [ ] 无效URL: ✅ / ❌
- [ ] 网络错误: ✅ / ❌

### 前端
- [ ] 添加功能: ✅ / ❌
- [ ] 显示功能: ✅ / ❌
- [ ] 删除功能: ✅ / ❌

## 发现的问题
1. ...
2. ...

## 建议
1. ...
2. ...
```

---

**最后更新：** 2026-01-23  
**版本：** 1.0-MVP
