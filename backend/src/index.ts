import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bilibiliRoutes } from './routes/bilibili';
import { downloadRoutes } from './routes/downloads';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// CORS配置（MVP版本允许所有来源）
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '0.1.0-mvp',
    timestamp: Date.now(),
  });
});

// API路由
app.route('/api/bilibili', bilibiliRoutes);
app.route('/api/downloads', downloadRoutes);

// 404处理
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not Found',
  }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json({
    success: false,
    error: err.message || 'Internal Server Error',
  }, 500);
});

export default app;
