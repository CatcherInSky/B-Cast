#!/usr/bin/env node

/**
 * 测试脚本：本地下载到本地R2
 * 从本地D1读取待下载列表，下载到本地临时目录，上传到本地R2，更新本地D1状态
 * 
 * 使用方式：
 *   pnpm test:download:local-to-local [--limit <number>]
 * 
 * 前置条件：
 *   1. 需要先启动本地Worker: pnpm dev:backend:local
 *   2. 本地D1需要已初始化
 */

import { unlinkSync } from 'fs';
import { downloadAudio, uploadToR2ViaWorkerAPI, updateStatus, getPendingDownloads, log } from './download-utils.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { limit: 1 };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      result.limit = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
用法: node test-download-local-to-local.js [选项]

选项:
  --limit <number>  限制下载数量（默认: 1）
  --help, -h        显示帮助信息

前置条件:
  1. 需要先启动本地Worker: pnpm dev:backend:local
  2. 本地D1需要已初始化

示例:
  node test-download-local-to-local.js --limit 3
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
  
  log('╔════════════════════════════════════════╗', 'blue');
  log('║  本地下载到本地R2测试脚本             ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  
  // 检查本地Worker是否运行
  const workerUrl = 'http://localhost:8787';
  log(`\n🔍 检查本地Worker: ${workerUrl}...`, 'blue');
  
  try {
    const isHealthy = await checkWorkerHealth(workerUrl);
    if (!isHealthy) {
      throw new Error('Worker未响应');
    }
    log('✓ 本地Worker运行正常', 'green');
  } catch (error) {
    log('❌ 无法连接到本地Worker', 'red');
    log('   请先运行: pnpm dev:backend:local', 'yellow');
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
      
      // 上传到本地R2（通过Worker API）
      const audioUrl = await uploadToR2ViaWorkerAPI(workerUrl, audioPath, bvid);
      
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
