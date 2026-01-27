# 前端播放功能使用指南

## 概述

前端提供了完整的音频播放功能，支持在播放列表和下载队列中播放已下载的音频文件。

## 播放功能位置

### 1. 播放列表页面（HomePage）
- **位置**：播放列表卡片中，展开后可以看到每个视频项
- **触发**：点击"播放"按钮
- **功能**：打开全屏播放器弹窗

### 2. 下载队列页面（DownloadsPage）
- **位置**：每个已完成的下载项下方
- **触发**：直接显示内嵌的音频播放器
- **功能**：使用浏览器原生播放控件

## 播放器功能

### AudioPlayer 组件（全屏播放器）
- ✅ 播放/暂停控制
- ✅ 进度条拖拽（支持跳转）
- ✅ 时间显示（当前时间/总时长）
- ✅ 音量控制（0-100%）
- ✅ 加载状态提示
- ✅ 错误处理和提示
- ✅ 在新标签页打开音频文件

### 原生 Audio 控件（下载队列页面）
- ✅ 浏览器原生播放控件
- ✅ 播放/暂停
- ✅ 进度控制
- ✅ 音量控制
- ✅ 播放速度控制

## 音频 URL 获取流程

1. **从 IndexedDB 读取**
   - 优先使用本地缓存的 `audioUrl`

2. **从后端同步**
   - 如果本地没有，自动调用 `/api/downloads/status` 同步
   - 更新 IndexedDB 中的 `audioUrl`

3. **构建 Worker API URL**
   - 格式：`{WORKER_URL}/api/downloads/audio/{bvid}`
   - 通过 Worker API 访问 R2 上的音频文件

## 错误处理

播放器会处理以下错误情况：
- ❌ 音频URL未设置
- ❌ 网络错误
- ❌ 音频解码失败
- ❌ 不支持的音频格式
- ❌ 音频加载被中止

所有错误都会显示友好的错误提示。

## 使用示例

### 在播放列表中播放
```typescript
// 1. 点击"播放"按钮
// 2. 自动检查 audioUrl
// 3. 如果没有，从后端同步
// 4. 打开全屏播放器
```

### 在下载队列中播放
```typescript
// 直接使用原生 audio 控件
<audio controls src={item.audioUrl} />
```

## 部署注意事项

### 环境变量配置
确保 `VITE_API_BASE` 正确设置：
- 本地开发：`http://localhost:8787`
- 生产环境：`https://your-worker.workers.dev`

### CORS 配置
确保 Worker 允许前端域名的跨域请求：
```typescript
// Worker 需要设置 CORS headers
headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
```

### 音频文件格式
- 当前支持：`.m4a` 格式（MPEG-4 Audio）
- 浏览器兼容性：现代浏览器都支持

## 调试

如果播放失败，检查：
1. **浏览器控制台**
   - 查看网络请求，确认音频 URL 是否正确
   - 查看是否有 CORS 错误

2. **Worker 日志**
   - 确认文件是否存在于 R2
   - 确认 `/api/downloads/audio/:bvid` 端点是否正常

3. **数据库**
   - 确认 `download_queue.audio_url` 字段是否正确设置
   - 确认状态是否为 `completed`

4. **环境变量**
   - 确认 `VITE_API_BASE` 是否正确配置
   - 确认 Worker URL 是否可访问

## 性能优化

- ✅ 使用 `preload="metadata"` 减少初始加载时间
- ✅ 支持范围请求（`Accept-Ranges: bytes`）
- ✅ 设置缓存策略（`Cache-Control`）
- ✅ 延迟加载（只在需要时加载音频）

## 未来改进

可能的改进方向：
- [ ] 播放列表功能（连续播放）
- [ ] 播放历史记录
- [ ] 播放速度控制（0.5x, 1x, 1.5x, 2x）
- [ ] 播放进度保存（恢复播放位置）
- [ ] 键盘快捷键支持
