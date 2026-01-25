import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bilibiliRoutes } from './routes/bilibili';
import { downloadRoutes } from './routes/downloads';
import { subscriptionRoutes } from './routes/subscriptions';
import { checkSubscriptionUpdates } from './services/cron';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  WORKER_URL?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string; // 格式: owner/repo
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS（允许所有来源，因为MVP版本没有认证）
app.use('*', cors());

// 健康检查
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// 路由
app.route('/api/bilibili', bilibiliRoutes);
app.route('/api/downloads', downloadRoutes);
app.route('/api/subscriptions', subscriptionRoutes);

// 手动触发Cron任务（用于测试和手动更新）
app.post('/api/cron/check-updates', async (c) => {
  try {
    console.log('🚀 手动触发订阅更新检查');
    const result = await checkSubscriptionUpdates(c.env);
    return c.json(result);
  } catch (error: any) {
    console.error('❌ 手动触发失败:', error);
    return c.json({ 
      success: false, 
      error: error.message || '执行失败' 
    }, 500);
  }
});

export default {
  fetch: app.fetch,
  
  /**
   * 定时任务：每天检查订阅更新
   * 触发时间通过wrangler.toml配置
   */
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    try {
      await checkSubscriptionUpdates(env);
    } catch (error) {
      console.error('❌ [Cron] 定时任务执行失败:', error);
    }
  }
};
