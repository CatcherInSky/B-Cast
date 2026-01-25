import { parseBilibili } from './bilibili';
import { generateRSSFromBilibili } from './rss';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  WORKER_URL?: string;
};

/**
 * 检查所有订阅更新的核心逻辑
 * 可以被cron触发器或手动API调用
 */
export async function checkSubscriptionUpdates(env: Bindings) {
  console.log('🔄 [Cron] 开始检查订阅更新...');
  
  try {
    // 1. 查询所有启用的订阅
    const subscriptionsResult = await env.DB.prepare(
      'SELECT * FROM subscriptions WHERE enabled = 1'
    ).all();
    
    const subscriptions = subscriptionsResult.results || [];
    
    if (subscriptions.length === 0) {
      console.log('ℹ️ [Cron] 没有启用的订阅');
      return {
        success: true,
        message: '没有启用的订阅',
        totalNewItems: 0,
        updatedSubscriptions: []
      };
    }
    
    console.log(`📋 [Cron] 找到 ${subscriptions.length} 个启用的订阅`);
    
    let totalNewItems = 0;
    const updatedSubscriptions: string[] = [];
    
    // 2. 遍历每个订阅
    for (const sub of subscriptions) {
      try {
        console.log(`🔍 [Cron] 检查订阅: ${sub.name}`);
        
        // 3. 重新解析B站URL
        const result = await parseBilibili(sub.bilibili_url as string);
        
        // 4. 获取已有的视频
        const existingItems = await env.DB.prepare(
          'SELECT bvid FROM subscription_items WHERE subscription_id = ?'
        ).bind(sub.id).all();
        
        const existingBvids = new Set(existingItems.results?.map((r: any) => r.bvid) || []);
        
        // 5. 找出新视频
        const newItems = result.items.filter((item: any) => !existingBvids.has(item.bvid));
        
        if (newItems.length > 0) {
          console.log(`📥 [Cron] 订阅 ${sub.name} 发现 ${newItems.length} 个新视频`);
          
          const now = Date.now();
          totalNewItems += newItems.length;
          updatedSubscriptions.push(sub.name as string);
          
          // 6. 添加新视频到数据库和下载队列
          for (const item of newItems as any[]) {
            const itemId = crypto.randomUUID();
            const queueId = crypto.randomUUID();
            
            // 插入subscription_items
            await env.DB.prepare(`
              INSERT INTO subscription_items 
              (id, subscription_id, bvid, title, duration, cover, pub_date, download_queue_id, added_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              itemId, sub.id, item.bvid, item.title,
              item.duration, item.cover, item.pubDate, queueId, now
            ).run();
            
            // 插入download_queue
            await env.DB.prepare(`
              INSERT OR IGNORE INTO download_queue 
              (id, bvid, title, duration, status, added_at)
              VALUES (?, ?, ?, ?, 'pending', ?)
            `).bind(queueId, item.bvid, item.title, item.duration, now).run();
          }
          
          // 7. 更新订阅的最新视频信息
          await env.DB.prepare(`
            UPDATE subscriptions 
            SET last_video_bvid = ?, last_video_pubdate = ?, updated_at = ?
            WHERE id = ?
          `).bind(result.items[0].bvid, result.items[0].pubDate, now, sub.id).run();
          
          // 8. 重新生成RSS（包含所有视频和已下载的音频）
          const allItems = await env.DB.prepare(`
            SELECT 
              si.bvid, si.title, si.duration, si.cover, si.pub_date as pubDate,
              dq.audio_url as audioUrl, dq.file_size as fileSize
            FROM subscription_items si
            LEFT JOIN download_queue dq ON si.download_queue_id = dq.id
            WHERE si.subscription_id = ?
            ORDER BY si.pub_date DESC
          `).bind(sub.id).all();
          
          // 使用配置的WORKER_URL
          const baseUrl = env.WORKER_URL 
            ? (env.WORKER_URL.startsWith('http') ? env.WORKER_URL : `https://${env.WORKER_URL}`)
            : 'https://b-cast.workers.dev'; // 默认值
          
          const rssXml = generateRSSFromBilibili(
            result.playlist,
            (allItems.results || []) as any,
            baseUrl
          );
          
          // 更新RSS到R2
          const rssFileName = `rss/${sub.id}.xml`;
          await env.BUCKET.put(rssFileName, rssXml, {
            httpMetadata: {
              contentType: 'application/xml; charset=utf-8',
            },
          });
          
          console.log(`✅ [Cron] 订阅 ${sub.name} RSS已更新`);
        } else {
          console.log(`ℹ️ [Cron] 订阅 ${sub.name} 无新视频`);
        }
        
        // 9. 更新last_check_at
        await env.DB.prepare(
          'UPDATE subscriptions SET last_check_at = ? WHERE id = ?'
        ).bind(Date.now(), sub.id).run();
        
      } catch (error) {
        console.error(`❌ [Cron] 检查订阅 ${sub.name} 失败:`, error);
        // 继续处理下一个订阅
      }
    }
    
    console.log(`✅ [Cron] 订阅更新检查完成，共发现 ${totalNewItems} 个新视频`);
    
    return {
      success: true,
      totalNewItems,
      updatedSubscriptions,
      checkedCount: subscriptions.length
    };
    
  } catch (error) {
    console.error('❌ [Cron] 定时任务执行失败:', error);
    throw error;
  }
}
