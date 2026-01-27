#!/usr/bin/env node

/**
 * 下载工具函数
 * 供测试脚本使用
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

export function log(message, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export async function downloadAudio(bvid, title) {
  log(`\n📥 下载音频: ${bvid} - ${title.substring(0, 50)}...`, 'cyan');
  
  // 检查 yt-dlp 是否可用
  let ytdlpCmd = null;
  try {
    execSync('which yt-dlp', { stdio: 'pipe' });
    ytdlpCmd = 'yt-dlp';
  } catch (e) {
    try {
      execSync('which ytdlp', { stdio: 'pipe' });
      ytdlpCmd = 'ytdlp';
    } catch (e2) {
      throw new Error('yt-dlp 未安装。请运行: pip install yt-dlp 或 brew install yt-dlp');
    }
  }
  
  // 创建临时目录
  const tempDir = '/tmp/b-cast-downloads';
  execSync(`mkdir -p ${tempDir}`, { stdio: 'pipe' });
  const outputPath = `${tempDir}/${bvid}`;
  
  // 使用 yt-dlp 下载
  const url = `https://www.bilibili.com/video/${bvid}`;
  log(`   下载URL: ${url}`, 'cyan');
  
  try {
    // 调用 yt-dlp
    execSync(`${ytdlpCmd} -f "bestaudio/best" -x --audio-format m4a --audio-quality 192K -o "${outputPath}.%(ext)s" "${url}"`, {
      stdio: 'inherit',
      cwd: rootDir
    });
    
    const finalPath = `${outputPath}.m4a`;
    if (!existsSync(finalPath)) {
      throw new Error(`下载的文件未找到: ${finalPath}`);
    }
    
    // 获取文件大小
    const stats = execSync(`stat -f%z "${finalPath}"`, { encoding: 'utf8', stdio: 'pipe' });
    const fileSize = parseInt(stats.trim(), 10);
    
    log(`   ✓ 下载完成: ${(fileSize / 1024 / 1024).toFixed(2)} MB`, 'green');
    return { path: finalPath, size: fileSize };
  } catch (error) {
    throw new Error(`yt-dlp 下载失败: ${error.message}`);
  }
}

export async function uploadToR2ViaWorkerAPI(workerUrl, filePath, bvid) {
  log(`\n📤 上传到R2 (通过Worker API): ${bvid}...`, 'cyan');
  
  try {
    const fileBuffer = readFileSync(filePath);
    
    // 创建 multipart/form-data 请求
    const boundary = `----formdata-b-cast-${Date.now()}`;
    const CRLF = '\r\n';
    
    let body = '';
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="file"; filename="${bvid}.m4a"${CRLF}`;
    body += `Content-Type: audio/mp4${CRLF}${CRLF}`;
    
    const filePart = Buffer.from(body, 'utf8');
    const endPart = Buffer.from(`${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="bvid"${CRLF}${CRLF}${bvid}${CRLF}--${boundary}--${CRLF}`, 'utf8');
    
    const totalLength = filePart.length + fileBuffer.length + endPart.length;
    
    // 上传到 Worker API
    return new Promise((resolve, reject) => {
      const url = new URL(`${workerUrl}/api/downloads/upload-audio`);
      const client = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength.toString(),
          'User-Agent': 'B-Cast-Download-Script',
        },
        timeout: 300000, // 5分钟超时（上传大文件）
      };
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            const result = JSON.parse(data);
            if (result.success) {
              log(`   ✓ 上传成功: ${result.audioUrl}`, 'green');
              resolve(result.audioUrl);
            } else {
              reject(new Error(result.error || '上传失败'));
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}, 响应: ${data.substring(0, 200)}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('上传超时'));
      });
      req.write(filePart);
      req.write(fileBuffer);
      req.write(endPart);
      req.end();
    });
  } catch (error) {
    throw new Error(`上传失败: ${error.message}`);
  }
}

export async function uploadToR2ViaWrangler(filePath, bvid, bucketName, remote = true) {
  const location = remote ? '线上' : '本地';
  log(`\n📤 上传到R2 (通过Wrangler CLI, ${location}): ${bvid}...`, 'cyan');
  
  try {
    const audioKey = `audio/${bvid}.m4a`;
    
    // 构建命令，根据 remote 参数决定是否添加 --remote 标志
    const remoteFlag = remote ? '--remote' : '';
    const command = `cd backend && pnpm exec wrangler r2 object put ${bucketName}/${audioKey} --file "${filePath}" --content-type audio/mp4 ${remoteFlag}`.trim();
    
    // 使用 wrangler r2 object put 上传
    execSync(command, {
      stdio: 'inherit',
      cwd: rootDir
    });
    
    // 返回 URL（需要通过 Worker API 访问）
    log(`   ✓ 上传成功 (${location}R2)`, 'green');
    return `audio/${bvid}.m4a`; // 返回 key，调用者需要构建完整 URL
  } catch (error) {
    throw new Error(`Wrangler上传失败: ${error.message}`);
  }
}

export async function updateStatus(workerUrl, bvid, status, audioUrl, fileSize, error, retries = 3) {
  log(`\n📝 更新状态: ${bvid} -> ${status}...`, 'cyan');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = new URL(`${workerUrl}/api/downloads/update-status`);
      const client = url.protocol === 'https:' ? https : http;
      
      // 确保参数正确序列化
      const payload = JSON.stringify({ 
        bvid, 
        status, 
        audioUrl: audioUrl || undefined, 
        fileSize: fileSize || undefined, 
        error: error || undefined 
      });
      
      const result = await new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'User-Agent': 'B-Cast-Download-Script',
            'Connection': 'close', // 确保连接关闭
          },
          timeout: 30000,
        };
        
        const req = client.request(options, (res) => {
          let data = '';
          let hasData = false;
          
          res.on('data', (chunk) => {
            hasData = true;
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data || '无响应内容'}`));
                return;
              }
              
              // 如果没有数据，可能是连接提前关闭
              if (!hasData && res.statusCode === 200) {
                // 对于本地 Worker，有时会提前关闭连接但操作已成功
                // 尝试等待一小段时间后假设成功
                setTimeout(() => {
                  log(`   ⚠️  响应为空但状态码200，假设操作成功`, 'yellow');
                  resolve(true);
                }, 500);
                return;
              }
              
              const result = JSON.parse(data);
              if (result.success) {
                resolve(true);
              } else {
                reject(new Error(result.error || '更新失败'));
              }
            } catch (e) {
              reject(new Error(`解析响应失败: ${e.message}, 响应: ${data.substring(0, 200)}`));
            }
          });
        });
        
        req.on('error', (err) => {
          // 对于连接重置错误，提供更友好的错误信息
          if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            reject(new Error(`连接被重置 (${err.code})，可能是本地Worker提前关闭连接`));
          } else {
            reject(err);
          }
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('请求超时'));
        });
        
        req.write(payload);
        req.end();
      });
      
      log(`   ✓ 状态更新成功`, 'green');
      return result;
      
      } catch (error) {
        const isLastAttempt = attempt === retries;
        const errorMsg = error.message || String(error);
        
        if (isLastAttempt) {
          log(`   ❌ 状态更新失败 (尝试 ${attempt}/${retries}): ${errorMsg}`, 'red');
          throw error; // 最后一次尝试失败时抛出错误
        } else {
          log(`   ⚠️  状态更新失败，重试中 (${attempt}/${retries}): ${errorMsg}`, 'yellow');
          // 等待一段时间后重试，使用指数退避
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 最多5秒
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
  }
}

export async function getPendingDownloads(workerUrl, limit) {
  log(`\n📋 获取待下载列表（限制: ${limit}）...`, 'blue');
  
  try {
    const url = new URL(`${workerUrl}/api/downloads/pending`);
    const client = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': 'B-Cast-Download-Script',
        },
        timeout: 30000, // 30秒超时
      };
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            const result = JSON.parse(data);
            if (result.success) {
              const items = result.items.slice(0, limit);
              log(`   ✓ 找到 ${items.length} 个待下载任务`, 'green');
              resolve(items);
            } else {
              reject(new Error(result.error || '获取失败'));
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}, 响应: ${data.substring(0, 200)}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
      req.end();
    });
  } catch (error) {
    throw new Error(`获取待下载列表失败: ${error.message}`);
  }
}
