#!/usr/bin/env python3
"""
B-Cast 下载脚本 - 改进版
通过Worker API获取任务和更新状态，使用yt-dlp下载B站音频并通过Wrangler上传到R2
"""

import os
import json
import sys
import subprocess
import requests
from datetime import datetime
from pathlib import Path

try:
    from yt_dlp import YoutubeDL
except ImportError:
    print("❌ yt-dlp not installed")
    print("   Run: pip install yt-dlp")
    sys.exit(1)

# 环境变量
WORKER_URL = os.environ.get('WORKER_URL')
CLOUDFLARE_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')
CLOUDFLARE_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'b-cast-audio')
BILIBILI_SESSDATA = os.environ.get('BILIBILI_SESSDATA')  # B站Cookie，用于下载受限视频

# 验证环境变量
required_vars = {
    'WORKER_URL': WORKER_URL,
    'CLOUDFLARE_API_TOKEN': CLOUDFLARE_API_TOKEN,
    'CLOUDFLARE_ACCOUNT_ID': CLOUDFLARE_ACCOUNT_ID,
}

missing = [k for k, v in required_vars.items() if not v]
if missing:
    print(f"❌ Missing environment variables: {', '.join(missing)}")
    sys.exit(1)

# 确保WORKER_URL格式正确
WORKER_URL = WORKER_URL.rstrip('/')

def get_pending_downloads(limit=None):
    """从Worker API获取待下载任务。limit 为单次最多条数，用于控制每轮下载量（防超时/限流）。"""
    try:
        url = f'{WORKER_URL}/api/downloads/pending'
        if limit is not None and limit > 0:
            url = f'{url}?limit={min(limit, 50)}'
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            raise Exception(f"API返回失败: {data.get('error')}")
        
        return data.get('items', [])
    except Exception as e:
        raise Exception(f"获取待下载列表失败: {str(e)}")

def update_download_status(bvid, status, audio_url=None, file_size=None, error=None):
    """更新下载状态到Worker API"""
    try:
        payload = {
            'bvid': bvid,
            'status': status
        }
        
        if audio_url:
            payload['audioUrl'] = audio_url
        if file_size:
            payload['fileSize'] = file_size
        if error:
            payload['error'] = error
        
        response = requests.post(
            f'{WORKER_URL}/api/downloads/update-status',
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            raise Exception(f"API返回失败: {data.get('error')}")
        
        return True
    except Exception as e:
        print(f"   ⚠️  更新状态失败: {e}")
        return False

def download_audio(bvid, title):
    """使用 yt-dlp 直接下载音频，优先 m4a（不转码，缩短 Action 执行时间）。"""
    url = f'https://www.bilibili.com/video/{bvid}'
    temp_dir = Path('/tmp/b-cast-downloads')
    temp_dir.mkdir(exist_ok=True)
    output_path = temp_dir / bvid

    # 优先 m4a，否则任意最佳音频；不启用 FFmpeg 后处理，避免转码耗时
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio',
        'outtmpl': f'{output_path}.%(ext)s',
        'quiet': False,
        'no_warnings': False,
        'retries': 3,
        'fragment_retries': 3,
    }
    if BILIBILI_SESSDATA:
        ydl_opts['cookiefile'] = None
        ydl_opts['http_headers'] = {
            'Cookie': f'SESSDATA={BILIBILI_SESSDATA}',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info:
                raise Exception('未获取到视频信息')
            ext = (info.get('ext') or 'm4a').lower()
            final_path = f'{output_path}.{ext}'
            if not os.path.exists(final_path):
                raise Exception(f"下载的文件未找到: {final_path}")
            file_size = os.path.getsize(final_path)
            return final_path, file_size, ext
    except Exception as e:
        raise Exception(f"yt-dlp下载失败: {str(e)}")

# 扩展名 -> Content-Type（R2 上传与 Worker 响应用）
AUDIO_CONTENT_TYPES = {
    'm4a': 'audio/mp4',
    'mp4': 'audio/mp4',
    'webm': 'audio/webm',
    'opus': 'audio/opus',
    'ogg': 'audio/ogg',
    'mp3': 'audio/mpeg',
    'aac': 'audio/aac',
}


def upload_to_r2_via_wrangler(local_path, bvid, ext='m4a'):
    """通过 Wrangler CLI 上传文件到 R2，支持多种音频扩展名。"""
    try:
        audio_key = f'audio/{bvid}.{ext}'
        content_type = AUDIO_CONTENT_TYPES.get(ext, 'application/octet-stream')
        cmd = [
            'wrangler', 'r2', 'object', 'put',
            f'{R2_BUCKET_NAME}/{audio_key}',
            '--file', local_path,
            '--content-type', content_type,
        ]
        env = os.environ.copy()
        env['CLOUDFLARE_API_TOKEN'] = CLOUDFLARE_API_TOKEN
        env['CLOUDFLARE_ACCOUNT_ID'] = CLOUDFLARE_ACCOUNT_ID
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)
        if result.returncode != 0:
            raise Exception(f"Wrangler上传失败: {result.stderr}")
        # 带扩展名的 URL，Worker 据此从 R2 取对应文件
        audio_url = f"{WORKER_URL}/api/downloads/audio/{bvid}.{ext}"
        return audio_url
    except subprocess.TimeoutExpired:
        raise Exception("上传超时（5分钟）")
    except Exception as e:
        raise Exception(f"R2上传失败: {str(e)}")

def main():
    print("🚀 B-Cast Download Worker")
    print(f"📅 {datetime.now().isoformat()}")
    print(f"🌐 Worker URL: {WORKER_URL}")
    print()
    
    # 1. 获取待下载任务（可选：环境变量 DOWNLOAD_LIMIT 限制单次条数，避免超时或 B 站限流）
    limit_str = os.environ.get('DOWNLOAD_LIMIT')
    limit = int(limit_str) if (limit_str and limit_str.isdigit()) else None
    if limit is not None:
        print(f"📥 获取待下载任务（本次最多 {limit} 条）...")
    else:
        print("📥 获取待下载任务...")
    try:
        pending_items = get_pending_downloads(limit=limit)
    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)
    
    if not pending_items:
        print("✅ 没有待下载的任务")
        # 写入summary
        with open('download-summary.json', 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'total': 0,
                'success': 0,
                'failed': 0,
                'items': []
            }, f, indent=2)
        return
    
    print(f"📋 找到 {len(pending_items)} 个待下载任务")
    print()
    
    success_count = 0
    fail_count = 0
    summary_items = []
    
    for item in pending_items:
        bvid = item['bvid']
        title = item['title']
        
        print(f"⏳ 处理: {bvid} - {title[:50]}...")
        item_result = {
            'bvid': bvid,
            'title': title,
            'status': 'failed',
            'error': None
        }
        
        try:
            # 2. 更新状态为downloading
            update_download_status(bvid, 'downloading')
            
            # 3. 下载音频（直接下 m4a 或最佳音频，不转码）
            print(f"   📥 下载中...")
            audio_path, file_size, ext = download_audio(bvid, title)
            print(f"   ✅ 已下载: {file_size / 1024 / 1024:.2f}MB (.{ext})")
            
            # 4. 上传到R2
            print(f"   📤 上传到R2...")
            audio_url = upload_to_r2_via_wrangler(audio_path, bvid, ext)
            print(f"   ✅ 已上传: {audio_url}")
            
            # 5. 更新状态为completed
            update_download_status(bvid, 'completed', audio_url, file_size)
            
            # 清理临时文件
            try:
                os.remove(audio_path)
            except:
                pass
            
            print(f"✅ 完成: {bvid}")
            success_count += 1
            item_result['status'] = 'success'
            item_result['audio_url'] = audio_url
            item_result['file_size'] = file_size
            
        except Exception as e:
            error_msg = str(e)
            print(f"❌ 失败: {bvid} - {error_msg}")
            fail_count += 1
            
            # 更新失败状态
            update_download_status(bvid, 'failed', error=error_msg[:500])
            
            item_result['error'] = error_msg
        
        summary_items.append(item_result)
        print()
    
    # 写入summary
    summary = {
        'timestamp': datetime.now().isoformat(),
        'total': len(pending_items),
        'success': success_count,
        'failed': fail_count,
        'items': summary_items
    }
    
    with open('download-summary.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    # 打印总结
    print("=" * 60)
    print(f"✅ 成功: {success_count}")
    print(f"❌ 失败: {fail_count}")
    print(f"📊 总计: {len(pending_items)}")
    print("=" * 60)
    
    # 如果有失败，返回非0退出码
    if fail_count > 0:
        sys.exit(1)

if __name__ == '__main__':
    main()
