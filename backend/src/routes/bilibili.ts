import { Hono } from 'hono';
import { parseBilibili } from '../services/bilibili';
import type { Env } from '../types';

export const bilibiliRoutes = new Hono<{ Bindings: Env }>();

// 解析B站URL
bilibiliRoutes.post('/parse', async (c) => {
  try {
    const { url } = await c.req.json<{ url: string }>();

    if (!url) {
      return c.json({
        success: false,
        error: '缺少URL参数',
      }, 400);
    }

    // 验证URL格式
    if (!url.includes('bilibili.com')) {
      return c.json({
        success: false,
        error: '不是有效的B站URL',
      }, 400);
    }

    console.log('解析B站URL:', url);
    const result = await parseBilibili(url);

    return c.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('解析失败:', error);
    const errorMessage = error instanceof Error ? error.message : '解析失败';
    
    return c.json({
      success: false,
      error: errorMessage,
    }, 500);
  }
});
