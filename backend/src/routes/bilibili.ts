import { Hono } from 'hono';
import { parseBilibili } from '../services/bilibili';

export const bilibiliRoutes = new Hono();

bilibiliRoutes.post('/parse', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!url) {
      return c.json({ success: false, error: '缺少URL参数' }, 400);
    }

    console.log('📥 Parsing URL:', url);

    // 自动识别URL类型并解析
    // 支持：合集、单视频、UP主空间
    const result = await parseBilibili(url);

    return c.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ 解析失败:', error);
    return c.json({
      success: false,
      error: error.message || '解析失败'
    }, 500);
  }
});
