import { Hono } from 'hono';
import type { Env, DownloadQueueItem } from '../types';

export const downloadRoutes = new Hono<{ Bindings: Env }>();

// 生成UUID（简化版）
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 添加到下载队列
downloadRoutes.post('/queue', async (c) => {
  try {
    const { items } = await c.req.json<{
      items: Array<{
        bvid: string;
        title: string;
        duration: number;
      }>;
    }>();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({
        success: false,
        error: '无效的参数：items必须是非空数组',
      }, 400);
    }

    const db = c.env.DB;
    const now = Date.now();
    let queuedCount = 0;

    for (const item of items) {
      try {
        // 检查是否已存在
        const existing = await db.prepare(
          'SELECT id FROM download_queue WHERE bvid = ?'
        ).bind(item.bvid).first();

        if (existing) {
          console.log(`跳过已存在的项目: ${item.bvid}`);
          continue;
        }

        // 插入新记录
        await db.prepare(`
          INSERT INTO download_queue (id, bvid, title, duration, status, retry_count, added_at)
          VALUES (?, ?, ?, ?, 'pending', 0, ?)
        `).bind(
          generateId(),
          item.bvid,
          item.title,
          item.duration || 0,
          now
        ).run();

        queuedCount++;
        console.log(`已添加到队列: ${item.bvid}`);

      } catch (err) {
        console.error(`添加失败 ${item.bvid}:`, err);
      }
    }

    return c.json({
      success: true,
      queuedCount,
      message: `成功添加 ${queuedCount}/${items.length} 个项目到下载队列`,
    });

  } catch (error) {
    console.error('添加队列失败:', error);
    const errorMessage = error instanceof Error ? error.message : '添加失败';
    
    return c.json({
      success: false,
      error: errorMessage,
    }, 500);
  }
});

// 查询下载状态
downloadRoutes.get('/status', async (c) => {
  try {
    const bvidsParam = c.req.query('bvids');
    
    if (!bvidsParam) {
      return c.json({ items: [] });
    }

    const bvids = bvidsParam.split(',').filter(Boolean);

    if (bvids.length === 0) {
      return c.json({ items: [] });
    }

    const db = c.env.DB;
    const placeholders = bvids.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT bvid, status, audio_url, file_size, error_message
      FROM download_queue
      WHERE bvid IN (${placeholders})
    `).bind(...bvids);

    const result = await stmt.all<{
      bvid: string;
      status: string;
      audio_url: string | null;
      file_size: number | null;
      error_message: string | null;
    }>();

    const items = (result.results || []).map(row => ({
      bvid: row.bvid,
      status: row.status,
      audioUrl: row.audio_url || undefined,
      fileSize: row.file_size || undefined,
      error: row.error_message || undefined,
    }));

    return c.json({ items });

  } catch (error) {
    console.error('查询状态失败:', error);
    return c.json({ items: [] }, 500);
  }
});

// 获取所有下载记录（用于调试）
downloadRoutes.get('/list', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db.prepare(`
      SELECT *
      FROM download_queue
      ORDER BY added_at DESC
      LIMIT 100
    `).all<DownloadQueueItem>();

    const items = (result.results || []).map(row => ({
      id: row.id,
      bvid: row.bvid,
      title: row.title,
      status: row.status,
      audioUrl: row.audio_url || undefined,
      fileSize: row.file_size || undefined,
      error: row.error_message || undefined,
      addedAt: row.added_at,
      completedAt: row.completed_at || undefined,
    }));

    return c.json({ items });

  } catch (error) {
    console.error('获取列表失败:', error);
    return c.json({ items: [] }, 500);
  }
});
