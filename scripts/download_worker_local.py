#!/usr/bin/env python3
"""
B-Cast 下载脚本 - 本地测试版
仅下载音频，不上传到R2（适合快速本地测试）
"""

import os
import sys
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
WORKER_URL = os.environ.get('WORKER_URL', 'http://localhost:8787')
BILIBILI_SESSDATA = os.environ.get('BILIBILI_SESSDATA')

# 确保WORKER_URL格式正确
WORKER_URL = WORKER_URL.rstrip('/')

def get_pending_downloads():
    """从Worker API获取待下载任务"""
    try:
        response = requests.get(f'{WORKER_URL}/api/downloads/pending', timeout=30)
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
    """使用yt-dlp下载B站音频"""
    url = f'https://www.bilibili.com/video/{bvid}'
    
    # 创建下载目录（本地测试用）
    download_dir = Path('./downloads')
    download_dir.mkdir(exist_ok=True)
    
    output_path = download_dir / bvid
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'{output_path}.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'm4a',
            'preferredquality': '192',
        }],
        'quiet': False,
        'no_warnings': False,
        'retries': 3,
        'fragment_retries': 3,
    }
    
    # 如果有B站Cookie，添加到选项中
    if BILIBILI_SESSDATA:
        ydl_opts['cookiefile'] = None
        ydl_opts['http_headers'] = {
            'Cookie': f'SESSDATA={BILIBILI_SESSDATA}',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
    
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            # 查找生成的文件
            final_path = f'{output_path}.m4a'
            if not os.path.exists(final_path):
                raise Exception(f"下载的文件未找到: {final_path}")
            
            file_size = os.path.getsize(final_path)
            return final_path, file_size
            
    except Exception as e:
        raise Exception(f"yt-dlp下载失败: {str(e)}")

def main():
    print("🚀 B-Cast Download Worker (本地测试版)")
    print(f"📅 {datetime.now().isoformat()}")
    print(f"🌐 Worker URL: {WORKER_URL}")
    print(f"💾 下载目录: ./downloads/")
    print()
    
    # 检查Worker是否运行
    try:
        response = requests.get(f'{WORKER_URL}/health', timeout=5)
        if response.status_code != 200:
            print("❌ Worker未运行或无法访问")
            print("   请先运行: cd backend && pnpm run dev")
            sys.exit(1)
    except Exception as e:
        print("❌ 无法连接到Worker")
        print(f"   错误: {e}")
        print("   请先运行: cd backend && pnpm run dev")
        sys.exit(1)
    
    # 1. 获取待下载任务
    print("📥 获取待下载任务...")
    try:
        pending_items = get_pending_downloads()
    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)
    
    if not pending_items:
        print("✅ 没有待下载的任务")
        print()
        print("💡 提示：")
        print("   1. 访问 http://localhost:5173 添加订阅")
        print("   2. 或使用API: curl -X POST http://localhost:8787/api/subscriptions/add \\")
        print('      -d \'{"url":"https://space.bilibili.com/437316738"}\'')
        return
    
    print(f"📋 找到 {len(pending_items)} 个待下载任务")
    print()
    
    success_count = 0
    fail_count = 0
    
    for item in pending_items:
        bvid = item['bvid']
        title = item['title']
        
        print(f"⏳ 处理: {bvid} - {title[:50]}...")
        
        try:
            # 2. 更新状态为downloading
            update_download_status(bvid, 'downloading')
            
            # 3. 下载音频
            print(f"   📥 下载中...")
            audio_path, file_size = download_audio(bvid, title)
            print(f"   ✅ 已下载: {file_size / 1024 / 1024:.2f}MB")
            print(f"   💾 保存位置: {audio_path}")
            
            # 4. 模拟音频URL（本地测试）
            audio_url = f"{WORKER_URL}/api/audio/{bvid}.m4a"
            
            # 5. 更新状态为completed
            update_download_status(bvid, 'completed', audio_url, file_size)
            
            print(f"✅ 完成: {bvid}")
            success_count += 1
            
        except Exception as e:
            error_msg = str(e)
            print(f"❌ 失败: {bvid} - {error_msg}")
            fail_count += 1
            
            # 更新失败状态
            update_download_status(bvid, 'failed', error=error_msg[:500])
        
        print()
    
    # 打印总结
    print("=" * 60)
    print(f"✅ 成功: {success_count}")
    print(f"❌ 失败: {fail_count}")
    print(f"📊 总计: {len(pending_items)}")
    print("=" * 60)
    print()
    print(f"💾 下载的文件保存在: ./downloads/")
    print()

if __name__ == '__main__':
    main()
