#!/usr/bin/env node

/**
 * 列出本地 R2 存储的文件
 * 通过 Worker API 访问，因为 Miniflare 的存储格式不是直接的文件系统
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
  red: '\x1b[31m',
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

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
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
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function listR2Objects(workerUrl, prefix = '') {
  try {
    const url = `${workerUrl}/api/downloads/list-r2${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`;
    const response = await fetch(url);
    
    if (response.status !== 200 || !response.data.success) {
      throw new Error(response.data.error || '获取失败');
    }
    
    return response.data.files || [];
  } catch (error) {
    log(`❌ 列出文件失败: ${error.message}`, 'red');
    log('   请确保 Worker 正在运行: pnpm dev:backend:local', 'yellow');
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const prefix = args[0] || '';
  
  log('╔════════════════════════════════════════╗', 'blue');
  log('║  本地 R2 文件列表工具                 ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  
  const env = loadEnv();
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
    log('❌ 无法连接到本地Worker', 'red');
    log('   请先运行: pnpm dev:backend:local', 'yellow');
    process.exit(1);
  }
  
  log(`\n📋 列出本地 R2 文件${prefix ? ` (前缀: ${prefix})` : ''}...`, 'blue');
  
  const files = await listR2Objects(workerUrl, prefix);
  
  if (files.length === 0) {
    log('\n⚠️  没有找到文件', 'yellow');
    if (prefix) {
      log(`   前缀: ${prefix}`, 'cyan');
    }
  } else {
    log(`\n✓ 找到 ${files.length} 个文件:`, 'green');
    log('', 'reset');
    
    // 按类型分组显示
    const rssFiles = files.filter(f => f.key.startsWith('rss/'));
    const audioFiles = files.filter(f => f.key.startsWith('audio/'));
    const otherFiles = files.filter(f => !f.key.startsWith('rss/') && !f.key.startsWith('audio/'));
    
    if (rssFiles.length > 0) {
      log('📄 RSS 文件:', 'blue');
      rssFiles.forEach(file => {
        const sizeKB = (file.size / 1024).toFixed(2);
        log(`   - ${file.key} (${sizeKB} KB)`, 'cyan');
      });
      log('', 'reset');
    }
    
    if (audioFiles.length > 0) {
      log('🎵 音频文件:', 'blue');
      audioFiles.forEach(file => {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        log(`   - ${file.key} (${sizeMB} MB)`, 'cyan');
      });
      log('', 'reset');
    }
    
    if (otherFiles.length > 0) {
      log('📁 其他文件:', 'blue');
      otherFiles.forEach(file => {
        const sizeKB = (file.size / 1024).toFixed(2);
        log(`   - ${file.key} (${sizeKB} KB)`, 'cyan');
      });
      log('', 'reset');
    }
  }
  
  log('');
}

main().catch((error) => {
  log(`\n❌ 失败: ${error.message}`, 'red');
  process.exit(1);
});
