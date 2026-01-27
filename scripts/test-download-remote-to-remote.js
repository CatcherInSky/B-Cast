#!/usr/bin/env node

/**
 * 测试脚本：线上下载到线上R2
 * 从线上D1读取待下载列表，下载到本地临时目录，上传到线上R2，更新线上D1状态
 * 
 * 使用方式：
 *   pnpm test:download:remote-to-remote [--limit <number>]
 * 
 * 前置条件：
 *   1. Worker已部署
 *   2. .env 中配置了 WORKER_URL
 *   3. wrangler需要已登录
 */

import { execSync } from 'child_process';
import { unlinkSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { downloadAudio, uploadToR2ViaWrangler, updateStatus, getPendingDownloads, log } from './download-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function loadEnv() {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        env[key.trim()] = value;
      }
    }
  });
  return env;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { limit: 1 };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      result.limit = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
用法: node test-download-remote-to-remote.js [选项]

选项:
  --limit <number>  限制下载数量（默认: 1）
  --help, -h        显示帮助信息

前置条件:
  1. Worker已部署
  2. .env 中配置了 WORKER_URL
  3. wrangler需要已登录

示例:
  node test-download-remote-to-remote.js --limit 3
`);
      process.exit(0);
    }
  }
  
  return result;
}

async function checkWorkerHealth(workerUrl) {
  const http = (await import('http')).default;
  const https = (await import('https')).default;
  
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(workerUrl);
      const client = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/health',
        method: 'GET',
        timeout: 5000,
      };
      
      const req = client.request(options, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('健康检查超时'));
      });
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function main() {
  const args = parseArgs();
  const env = loadEnv();
  
  log('╔════════════════════════════════════════╗', 'blue');
  log('║  线上下载到线上R2测试脚本             ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  
  // 检查配置
  if (!env.WORKER_URL) {
    log('❌ 缺少 WORKER_URL 配置', 'red');
    log('   请运行 pnpm deploy 进行部署并获取 URL', 'yellow');
    process.exit(1);
  }
  
  if (!env.R2_BUCKET_NAME) {
    log('❌ 缺少 R2_BUCKET_NAME 配置', 'red');
    log('   请运行 pnpm init 进行初始化', 'yellow');
    process.exit(1);
  }
  
  const workerUrl = `https://${env.WORKER_URL}`;
  
  // 检查Worker是否可访问
  log(`\n🔍 检查Worker: ${workerUrl}...`, 'blue');
  
  try {
    const isHealthy = await checkWorkerHealth(workerUrl);
    if (!isHealthy) {
      throw new Error('Worker未响应');
    }
    log('✓ Worker运行正常', 'green');
  } catch (error) {
    log('❌ 无法连接到Worker', 'red');
    log(`   请检查 WORKER_URL 配置: ${env.WORKER_URL}`, 'yellow');
    process.exit(1);
  }
  
  // 检查wrangler登录
  log('\n🔍 检查 wrangler 登录状态...', 'blue');
  try {
    execSync('cd backend && pnpm exec wrangler whoami', { 
      encoding: 'utf8', 
      cwd: rootDir,
      stdio: 'pipe' 
    });
    log('✓ wrangler 已登录', 'green');
  } catch (error) {
    log('❌ wrangler 未登录', 'red');
    log('   请运行: cd backend && pnpm exec wrangler login', 'yellow');
    process.exit(1);
  }
  
  // 获取待下载列表
  const items = await getPendingDownloads(workerUrl, args.limit);
  
  if (items.length === 0) {
    log('\n⚠️  没有待下载的任务', 'yellow');
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const item of items) {
    const { bvid, title } = item;
    
    try {
      // 更新状态为downloading
      await updateStatus(workerUrl, bvid, 'downloading');
      
      // 下载音频
      const { path: audioPath, size: fileSize } = await downloadAudio(bvid, title);
      
      // 上传到线上R2（通过Wrangler CLI）
      await uploadToR2ViaWrangler(audioPath, bvid, env.R2_BUCKET_NAME);
      
      // 构建完整的音频URL
      const baseUrl = `https://${env.WORKER_URL}`;
      const audioUrl = `${baseUrl}/api/downloads/audio/${bvid}`;
      
      // 更新状态为completed
      await updateStatus(workerUrl, bvid, 'completed', audioUrl, fileSize);
      
      // 清理临时文件
      try {
        unlinkSync(audioPath);
      } catch (e) {
        // 忽略清理错误
      }
      
      log(`✓ 完成: ${bvid}`, 'green');
      successCount++;
    } catch (error) {
      log(`❌ 处理失败: ${bvid} - ${error.message}`, 'red');
      // 尝试更新失败状态，如果失败也不影响主流程
      try {
        await updateStatus(workerUrl, bvid, 'failed', null, null, error.message);
      } catch (statusError) {
        log(`   ⚠️  无法更新失败状态: ${statusError.message}`, 'yellow');
      }
      failCount++;
    }
  }
  
  log('\n╔════════════════════════════════════════╗', 'green');
  log('║     🎉 测试完成！                     ║', 'green');
  log('╚════════════════════════════════════════╝', 'green');
  log(`\n📊 统计:`, 'blue');
  log(`   成功: ${successCount}`, 'green');
  log(`   失败: ${failCount}`, failCount > 0 ? 'red' : 'green');
  log('');
}

main().catch((error) => {
  log(`\n❌ 测试失败: ${error.message}`, 'red');
  process.exit(1);
});
