#!/usr/bin/env node

/**
 * 查看本地 R2 中的 RSS 文件
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

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

async function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  log('╔════════════════════════════════════════╗', 'blue');
  log('║  查看本地 R2 中的 RSS 文件            ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  
  const workerUrl = 'http://localhost:8787';
  
  // 检查 Worker 是否运行
  log(`\n🔍 检查本地Worker: ${workerUrl}...`, 'blue');
  
  try {
    const healthCheck = await fetch(`${workerUrl}/health`);
    if (healthCheck.status !== 200) {
      throw new Error('Worker未响应');
    }
    log('✓ 本地Worker运行正常', 'green');
  } catch (error) {
    log('❌ 无法连接到本地Worker', 'yellow');
    log('   请先运行: pnpm dev:backend:local', 'yellow');
    process.exit(1);
  }
  
  // 列出 RSS 文件
  log(`\n📋 列出 RSS 文件...`, 'blue');
  
  try {
    const response = await fetch(`${workerUrl}/api/downloads/list-r2?prefix=rss/`);
    
    if (response.status !== 200 || !response.data.success) {
      throw new Error(response.data.error || '获取失败');
    }
    
    const files = response.data.files || [];
    
    if (files.length === 0) {
      log('\n⚠️  没有找到 RSS 文件', 'yellow');
      log('   可能原因：', 'yellow');
      log('   1. 还没有添加过订阅', 'cyan');
      log('   2. RSS 文件保存失败', 'cyan');
      log('', 'reset');
      log('💡 如何添加订阅：', 'blue');
      log('   1. 启动前端: pnpm dev:frontend', 'cyan');
      log('   2. 在浏览器中打开前端页面', 'cyan');
      log('   3. 点击"添加播放列表"，输入 B站 URL', 'cyan');
    } else {
      log(`\n✓ 找到 ${files.length} 个 RSS 文件:`, 'green');
      log('', 'reset');
      
      files.forEach((file, index) => {
        const sizeKB = (file.size / 1024).toFixed(2);
        const filename = file.key.split('/').pop();
        log(`${index + 1}. ${filename}`, 'cyan');
        log(`   大小: ${sizeKB} KB`, 'cyan');
        log(`   上传时间: ${new Date(file.uploaded).toLocaleString('zh-CN')}`, 'cyan');
        log(`   访问URL: ${workerUrl}/api/subscriptions/rss/${filename}`, 'cyan');
        log('', 'reset');
      });
      
      log('💡 如何访问 RSS：', 'blue');
      log('   1. 在浏览器中打开上面的访问URL', 'cyan');
      log('   2. 或使用 RSS 阅读器订阅该 URL', 'cyan');
      log('   3. 或使用 curl 查看内容:', 'cyan');
      log(`      curl ${workerUrl}/api/subscriptions/rss/${files[0].key.split('/').pop()}`, 'cyan');
    }
  } catch (error) {
    log(`\n❌ 获取 RSS 文件列表失败: ${error.message}`, 'yellow');
  }
  
  log('');
}

main().catch((error) => {
  log(`\n❌ 失败: ${error.message}`, 'yellow');
  process.exit(1);
});
