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

// 列出 R2 中的文件（用于调试）
downloadRoutes.get('/list-r2', async (c) => {
  try {
    const prefix = c.req.query('prefix') || '';
    const limit = parseInt(c.req.query('limit') || '100', 10);
    
    const listed = await c.env.BUCKET.list({
      prefix,
      limit,
    });
    
    const files = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
    }));
    
    return c.json({
      success: true,
      files,
      truncated: listed.truncated,
    });
  } catch (error: any) {
    console.error('列出R2文件失败:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
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
// 支持 ?limit=N 控制单次返回数量，避免单次 Action 下载过多导致超时或 B 站限流（默认 50，最大 50）
downloadRoutes.get('/pending', async (c) => {
  try {
    const limitParam = c.req.query('limit');
    const limit = limitParam
      ? Math.min(Math.max(1, parseInt(limitParam, 10)), 50)
      : 50;
    const db = c.env.DB;
    const result = await db.prepare(`
      SELECT id, bvid, title, duration
      FROM download_queue
      WHERE status = 'pending'
      ORDER BY added_at ASC
      LIMIT ?
    `).bind(limit).all();

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

// 上传音频文件到R2（用于测试脚本）
downloadRoutes.post('/upload-audio', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const bvid = formData.get('bvid') as string;

    if (!file || !bvid) {
      return c.json({ 
        success: false, 
        error: '缺少必需参数: file 和 bvid' 
      }, 400);
    }

    const audioKey = `audio/${bvid}.m4a`;
    console.log(`📤 上传音频文件到R2: ${audioKey}, 大小: ${file.size} bytes`);

    // 将文件转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    await c.env.BUCKET.put(audioKey, arrayBuffer, {
      httpMetadata: {
        contentType: 'audio/mp4',
      },
    });

    console.log(`✅ 音频文件已上传到R2: ${audioKey}`);

    // 生成访问URL
    const baseUrl = c.env.WORKER_URL 
      ? (c.env.WORKER_URL.startsWith('http') ? c.env.WORKER_URL : `https://${c.env.WORKER_URL}`)
      : new URL(c.req.url).origin;
    
    const audioUrl = `${baseUrl}/api/downloads/audio/${bvid}`;

    return c.json({
      success: true,
      audioUrl,
      fileSize: file.size,
    });

  } catch (error: any) {
    console.error('❌ 上传音频失败:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
});

// 获取音频文件（从R2）。支持 /audio/:bvid 或 /audio/:bvid.:ext（如 BV1xx.m4a）
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
};

downloadRoutes.get('/audio/:bvidOrPath', async (c) => {
  try {
    const bvidOrPath = c.req.param('bvidOrPath');
    const dotIdx = bvidOrPath.indexOf('.');
    const bvid = dotIdx >= 0 ? bvidOrPath.slice(0, dotIdx) : bvidOrPath;
    const ext = dotIdx >= 0 ? bvidOrPath.slice(dotIdx + 1) : 'm4a';
    const audioKey = `audio/${bvid}.${ext}`;

    console.log(`📥 请求音频文件: ${audioKey}`);

    const object = await c.env.BUCKET.get(audioKey);

    if (!object) {
      console.log(`❌ 音频文件不存在: ${audioKey}`);
      return c.text('Audio file not found', 404);
    }

    const audioData = await object.arrayBuffer();
    const contentType = AUDIO_CONTENT_TYPES[ext] || 'application/octet-stream';

    return new Response(audioData, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': audioData.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error: any) {
    console.error('❌ 获取音频失败:', error);
    return c.text('Failed to fetch audio file', 500);
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
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/download-audio.yml/dispatches`,
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
