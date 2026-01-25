import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

export const downloadRoutes = new Hono<{ Bindings: Bindings }>();

// 生成UUID
function generateId() {
  return crypto.randomUUID();
}

// 添加到队列
downloadRoutes.post('/queue', async (c) => {
  try {
    const { items } = await c.req.json();

    if (!items || !Array.isArray(items)) {
      return c.json({ success: false, error: '无效的参数' }, 400);
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
          INSERT INTO download_queue (id, bvid, title, duration, status, added_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).bind(
          generateId(),
          item.bvid,
          item.title,
          item.duration || 0,
          now
        ).run();

        queuedCount++;
      } catch (err) {
        console.error(`添加失败 ${item.bvid}:`, err);
      }
    }

    return c.json({
      success: true,
      queuedCount
    });

  } catch (error: any) {
    console.error('添加队列失败:', error);
    return c.json({
      success: false,
      error: error.message || '添加失败'
    }, 500);
  }
});

// 查询状态
downloadRoutes.get('/status', async (c) => {
  try {
    const bvids = c.req.query('bvids')?.split(',') || [];

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

    const result = await stmt.all();

    const items = result.results.map((row: any) => ({
      bvid: row.bvid,
      status: row.status,
      audioUrl: row.audio_url,
      fileSize: row.file_size,
      error: row.error_message
    }));

    return c.json({ items });

  } catch (error: any) {
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
    `).all();

    const items = result.results.map((row: any) => ({
      id: row.id,
      bvid: row.bvid,
      title: row.title,
      status: row.status,
      audioUrl: row.audio_url,
      fileSize: row.file_size,
      error: row.error_message,
      addedAt: row.added_at,
      completedAt: row.completed_at
    }));

    return c.json({ items });

  } catch (error: any) {
    console.error('获取列表失败:', error);
    return c.json({ items: [] }, 500);
  }
});

// 获取待下载的任务列表（供GitHub Action调用）
downloadRoutes.get('/pending', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db.prepare(`
      SELECT id, bvid, title, duration
      FROM download_queue
      WHERE status = 'pending'
      ORDER BY added_at ASC
      LIMIT 50
    `).all();

    const items = result.results.map((row: any) => ({
      id: row.id,
      bvid: row.bvid,
      title: row.title,
      duration: row.duration
    }));

    return c.json({ 
      success: true,
      count: items.length,
      items 
    });

  } catch (error: any) {
    console.error('获取待下载列表失败:', error);
    return c.json({ 
      success: false,
      error: error.message 
    }, 500);
  }
});

// 更新下载状态（供GitHub Action回调）
downloadRoutes.post('/update-status', async (c) => {
  try {
    const { bvid, status, audioUrl, fileSize, error } = await c.req.json();

    if (!bvid || !status) {
      return c.json({ 
        success: false, 
        error: '缺少必需参数' 
      }, 400);
    }

    const db = c.env.DB;
    const now = Date.now();

    // 更新状态
    let query = `
      UPDATE download_queue 
      SET status = ?, updated_at = ?
    `;
    const params: any[] = [status, now];

    if (status === 'completed' && audioUrl) {
      query += `, audio_url = ?, file_size = ?, completed_at = ?`;
      params.push(audioUrl, fileSize || 0, now);
    } else if (status === 'failed' && error) {
      query += `, error_message = ?`;
      params.push(error);
    }

    query += ` WHERE bvid = ?`;
    params.push(bvid);

    await db.prepare(query).bind(...params).run();

    return c.json({ success: true });

  } catch (error: any) {
    console.error('更新状态失败:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
});

// 手动触发GitHub Action下载（需要配置GITHUB_TOKEN）
downloadRoutes.post('/trigger-download', async (c) => {
  try {
    const { GITHUB_TOKEN, GITHUB_REPO } = c.env as any;

    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return c.json({ 
        success: false, 
        error: '未配置GitHub集成' 
      }, 500);
    }

    // 调用GitHub API触发workflow
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/download.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main', // 或者 'master'
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API错误: ${response.status} ${errorText}`);
    }

    return c.json({ 
      success: true, 
      message: '下载任务已触发' 
    });

  } catch (error: any) {
    console.error('触发下载失败:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
});
