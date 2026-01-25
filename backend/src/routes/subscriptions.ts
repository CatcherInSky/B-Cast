import { Hono } from 'hono';
import { parseBilibili } from '../services/bilibili';
import { generateRSSFromBilibili } from '../services/rss';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

export const subscriptionRoutes = new Hono<{ Bindings: Bindings }>();

/**
 * 添加订阅
 * POST /api/subscriptions/add
 */
subscriptionRoutes.post('/add', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!url) {
      return c.json({ success: false, error: '缺少URL参数' }, 400);
    }

    console.log('📥 添加订阅:', url);

    // 检查是否已存在
    const existing = await c.env.DB.prepare(
      'SELECT id FROM subscriptions WHERE bilibili_url = ?'
    ).bind(url).first();

    if (existing) {
      return c.json({ 
        success: false, 
        error: '该订阅已存在' 
      }, 400);
    }

    // 1. 解析B站URL
    const result = await parseBilibili(url);

    // 2. 生成订阅ID
    const subscriptionId = crypto.randomUUID();
    const now = Date.now();

    // 3. 生成RSS XML
    // 优先使用环境变量配置的WORKER_URL，否则使用请求origin
    const baseUrl = c.env.WORKER_URL 
      ? (c.env.WORKER_URL.startsWith('http') ? c.env.WORKER_URL : `https://${c.env.WORKER_URL}`)
      : new URL(c.req.url).origin;
    
    const rssXml = generateRSSFromBilibili(
      result.playlist,
      result.items,
      baseUrl
    );

    // 4. 保存RSS到R2
    const rssFileName = `rss/${subscriptionId}.xml`;
    console.log(`💾 保存RSS到R2: ${rssFileName}, 大小: ${rssXml.length} bytes`);
    
    await c.env.BUCKET.put(rssFileName, rssXml, {
      httpMetadata: {
        contentType: 'application/xml; charset=utf-8',
      },
    });
    
    console.log(`✅ RSS已保存到R2: ${rssFileName}`);

    const rssUrl = `${baseUrl}/api/subscriptions/rss/${subscriptionId}.xml`;

    // 5. 保存订阅信息到数据库
    await c.env.DB.prepare(`
      INSERT INTO subscriptions 
      (id, name, type, bilibili_url, rss_url, uploader_name, cover, description, 
       last_video_bvid, last_video_pubdate, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      subscriptionId,
      result.playlist.name,
      result.playlist.type,
      url,
      rssUrl,
      result.playlist.uploaderName,
      result.playlist.cover || null,
      result.playlist.description || null,
      result.items[0]?.bvid || null,
      result.items[0]?.pubDate || null,
      now,
      now
    ).run();

    // 6. 保存订阅项目到数据库
    for (const item of result.items) {
      const itemId = crypto.randomUUID();
      const queueId = crypto.randomUUID();

      // 插入subscription_items
      await c.env.DB.prepare(`
        INSERT INTO subscription_items 
        (id, subscription_id, bvid, title, duration, cover, pub_date, download_queue_id, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId,
        subscriptionId,
        item.bvid,
        item.title,
        item.duration,
        item.cover,
        item.pubDate,
        queueId,
        now
      ).run();

      // 插入download_queue
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO download_queue 
        (id, bvid, title, duration, status, added_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).bind(queueId, item.bvid, item.title, item.duration, now).run();
    }

    console.log(`✅ 订阅创建成功: ${result.playlist.name}, ${result.items.length}个视频`);

    return c.json({
      success: true,
      data: {
        id: subscriptionId,
        name: result.playlist.name,
        rssUrl: rssUrl,
        itemCount: result.items.length,
      }
    });

  } catch (error: any) {
    console.error('❌ 添加订阅失败:', error);
    return c.json({
      success: false,
      error: error.message || '添加订阅失败'
    }, 500);
  }
});

/**
 * 获取订阅列表
 * GET /api/subscriptions/list
 */
subscriptionRoutes.get('/list', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        s.*,
        COUNT(si.id) as item_count,
        SUM(CASE WHEN dq.status = 'downloaded' THEN 1 ELSE 0 END) as downloaded_count
      FROM subscriptions s
      LEFT JOIN subscription_items si ON s.id = si.subscription_id
      LEFT JOIN download_queue dq ON si.download_queue_id = dq.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all();

    return c.json({
      success: true,
      data: result.results || []
    });

  } catch (error: any) {
    console.error('❌ 获取订阅列表失败:', error);
    return c.json({
      success: false,
      error: error.message || '获取列表失败'
    }, 500);
  }
});

/**
 * 获取单个订阅详情
 * GET /api/subscriptions/:id
 */
subscriptionRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const subscription = await c.env.DB.prepare(
      'SELECT * FROM subscriptions WHERE id = ?'
    ).bind(id).first();

    if (!subscription) {
      return c.json({ success: false, error: '订阅不存在' }, 404);
    }

    const items = await c.env.DB.prepare(`
      SELECT 
        si.*,
        dq.status as download_status,
        dq.audio_url,
        dq.file_size
      FROM subscription_items si
      LEFT JOIN download_queue dq ON si.download_queue_id = dq.id
      WHERE si.subscription_id = ?
      ORDER BY si.pub_date DESC
    `).bind(id).all();

    return c.json({
      success: true,
      data: {
        subscription,
        items: items.results || []
      }
    });

  } catch (error: any) {
    console.error('❌ 获取订阅详情失败:', error);
    return c.json({
      success: false,
      error: error.message || '获取详情失败'
    }, 500);
  }
});

/**
 * 手动刷新订阅
 * POST /api/subscriptions/refresh/:id
 */
subscriptionRoutes.post('/refresh/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // 获取订阅信息
    const subscription = await c.env.DB.prepare(
      'SELECT * FROM subscriptions WHERE id = ?'
    ).bind(id).first();

    if (!subscription) {
      return c.json({ success: false, error: '订阅不存在' }, 404);
    }

    console.log('🔄 刷新订阅:', subscription.name);

    // 重新解析B站URL
    const result = await parseBilibili(subscription.bilibili_url as string);

    // 获取已有的视频
    const existingItems = await c.env.DB.prepare(
      'SELECT bvid FROM subscription_items WHERE subscription_id = ?'
    ).bind(id).all();

    const existingBvids = new Set(existingItems.results?.map((r: any) => r.bvid) || []);

    // 找出新视频
    const newItems = result.items.filter(item => !existingBvids.has(item.bvid));

    if (newItems.length > 0) {
      console.log(`📥 发现 ${newItems.length} 个新视频`);

      const now = Date.now();

      // 添加新视频
      for (const item of newItems) {
        const itemId = crypto.randomUUID();
        const queueId = crypto.randomUUID();

        await c.env.DB.prepare(`
          INSERT INTO subscription_items 
          (id, subscription_id, bvid, title, duration, cover, pub_date, download_queue_id, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          itemId, id, item.bvid, item.title,
          item.duration, item.cover, item.pubDate, queueId, now
        ).run();

        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO download_queue 
          (id, bvid, title, duration, status, added_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).bind(queueId, item.bvid, item.title, item.duration, now).run();
      }

      // 更新订阅的最新视频信息
      await c.env.DB.prepare(`
        UPDATE subscriptions 
        SET last_video_bvid = ?, last_video_pubdate = ?, updated_at = ?
        WHERE id = ?
      `).bind(result.items[0].bvid, result.items[0].pubDate, now, id).run();
    }

    // 重新生成RSS（包含所有视频，包括已下载的音频URL）
    const allItems = await c.env.DB.prepare(`
      SELECT 
        si.bvid, si.title, si.duration, si.cover, si.pub_date as pubDate,
        dq.audio_url as audioUrl, dq.file_size as fileSize
      FROM subscription_items si
      LEFT JOIN download_queue dq ON si.download_queue_id = dq.id
      WHERE si.subscription_id = ?
      ORDER BY si.pub_date DESC
    `).bind(id).all();

    // 优先使用环境变量配置的WORKER_URL
    const baseUrl = c.env.WORKER_URL 
      ? (c.env.WORKER_URL.startsWith('http') ? c.env.WORKER_URL : `https://${c.env.WORKER_URL}`)
      : new URL(c.req.url).origin;
    
    const rssXml = generateRSSFromBilibili(
      result.playlist,
      (allItems.results || []) as any,
      baseUrl
    );

    // 更新RSS到R2
    const rssFileName = `rss/${id}.xml`;
    await c.env.BUCKET.put(rssFileName, rssXml, {
      httpMetadata: {
        contentType: 'application/xml; charset=utf-8',
      },
    });

    // 更新last_check_at
    await c.env.DB.prepare(
      'UPDATE subscriptions SET last_check_at = ? WHERE id = ?'
    ).bind(Date.now(), id).run();

    console.log(`✅ 订阅刷新完成: ${newItems.length}个新视频`);

    return c.json({
      success: true,
      data: {
        newItemCount: newItems.length,
        totalItemCount: result.items.length
      }
    });

  } catch (error: any) {
    console.error('❌ 刷新订阅失败:', error);
    return c.json({
      success: false,
      error: error.message || '刷新失败'
    }, 500);
  }
});

/**
 * 删除订阅
 * DELETE /api/subscriptions/:id
 */
subscriptionRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // 检查订阅是否存在
    const subscription = await c.env.DB.prepare(
      'SELECT * FROM subscriptions WHERE id = ?'
    ).bind(id).first();

    if (!subscription) {
      return c.json({ success: false, error: '订阅不存在' }, 404);
    }

    console.log('🗑️ 删除订阅:', subscription.name);

    // 删除R2中的RSS文件
    const rssFileName = `rss/${id}.xml`;
    await c.env.BUCKET.delete(rssFileName);

    // 删除数据库记录（级联删除subscription_items）
    await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();

    console.log('✅ 订阅删除成功');

    return c.json({
      success: true,
      message: '订阅已删除'
    });

  } catch (error: any) {
    console.error('❌ 删除订阅失败:', error);
    return c.json({
      success: false,
      error: error.message || '删除失败'
    }, 500);
  }
});

/**
 * 获取RSS XML文件
 * GET /api/subscriptions/rss/:filename
 */
subscriptionRoutes.get('/rss/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const rssFileName = `rss/${filename}`;

    console.log(`📥 请求RSS文件: ${rssFileName}`);

    const object = await c.env.BUCKET.get(rssFileName);

    if (!object) {
      console.log(`❌ RSS文件不存在: ${rssFileName}`);
      
      // 列出R2中所有的RSS文件，帮助调试
      const listed = await c.env.BUCKET.list({ prefix: 'rss/' });
      console.log(`📋 R2中现有的RSS文件:`, listed.objects.map(obj => obj.key));
      
      return c.text('RSS feed not found', 404);
    }

    const rssContent = await object.text();
    console.log(`✅ 成功获取RSS文件: ${rssFileName}, 大小: ${rssContent.length} bytes`);

    return c.text(rssContent, 200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',  // 缓存1小时
    });

  } catch (error: any) {
    console.error('❌ 获取RSS失败:', error);
    return c.text('Failed to fetch RSS feed', 500);
  }
});

/**
 * 切换订阅启用状态
 * POST /api/subscriptions/toggle/:id
 */
subscriptionRoutes.post('/toggle/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const subscription = await c.env.DB.prepare(
      'SELECT enabled FROM subscriptions WHERE id = ?'
    ).bind(id).first();

    if (!subscription) {
      return c.json({ success: false, error: '订阅不存在' }, 404);
    }

    const newStatus = subscription.enabled === 1 ? 0 : 1;

    await c.env.DB.prepare(
      'UPDATE subscriptions SET enabled = ?, updated_at = ? WHERE id = ?'
    ).bind(newStatus, Date.now(), id).run();

    return c.json({
      success: true,
      data: { enabled: newStatus === 1 }
    });

  } catch (error: any) {
    console.error('❌ 切换订阅状态失败:', error);
    return c.json({
      success: false,
      error: error.message || '操作失败'
    }, 500);
  }
});
