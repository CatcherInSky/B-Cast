#!/usr/bin/env python3
"""
B-Cast MVP 下载Worker
运行在GitHub Actions中，从D1读取下载队列，下载B站音频并上传到R2
"""

import os
import sys
import json
import time
import requests
import boto3
from datetime import datetime
from pathlib import Path

try:
    from yt_dlp import YoutubeDL
except ImportError:
    print("❌ yt-dlp未安装，请运行: pip install yt-dlp")
    sys.exit(1)

# 环境变量
ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
DATABASE_ID = os.environ.get('D1_DATABASE_ID')
API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')
R2_ENDPOINT = os.environ.get('R2_ENDPOINT')
R2_ACCESS_KEY = os.environ.get('R2_ACCESS_KEY')
R2_SECRET_KEY = os.environ.get('R2_SECRET_KEY')
R2_BUCKET = os.environ.get('R2_BUCKET', 'b-cast-audio')

# 验证环境变量
required_vars = {
    'CLOUDFLARE_ACCOUNT_ID': ACCOUNT_ID,
    'D1_DATABASE_ID': DATABASE_ID,
    'CLOUDFLARE_API_TOKEN': API_TOKEN,
    'R2_ENDPOINT': R2_ENDPOINT,
    'R2_ACCESS_KEY': R2_ACCESS_KEY,
    'R2_SECRET_KEY': R2_SECRET_KEY,
}

missing_vars = [k for k, v in required_vars.items() if not v]
if missing_vars:
    print(f"❌ 缺少环境变量: {', '.join(missing_vars)}")
    print("请在GitHub仓库的Secrets中配置这些变量")
    sys.exit(1)

# 初始化S3客户端（R2兼容S3 API）
try:
    s3 = boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY
    )
    print(f"✅ S3客户端初始化成功 (Endpoint: {R2_ENDPOINT})")
except Exception as e:
    print(f"❌ S3客户端初始化失败: {e}")
    sys.exit(1)


def query_d1(sql, params=None):
    """查询D1数据库"""
    url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query'
    headers = {
        'Authorization': f'Bearer {API_TOKEN}',
        'Content-Type': 'application/json'
    }
    payload = {
        'sql': sql,
        'params': params or []
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            raise Exception(f"D1 API错误: {data.get('errors', [])}")
        
        return data['result'][0] if data.get('result') else {'results': []}
    except Exception as e:
        print(f"❌ D1查询失败: {e}")
        raise


def download_audio(bvid, title):
    """使用yt-dlp下载B站音频"""
    url = f'https://www.bilibili.com/video/{bvid}'
    output_path = Path('/tmp') / f'{bvid}.m4a'
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': str(Path('/tmp') / f'{bvid}.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'm4a',
            'preferredquality': '192',
        }],
        'quiet': False,
        'no_warnings': False,
    }
    
    print(f"  ⬇️  开始下载: {url}")
    
    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        if not output_path.exists():
            raise Exception(f"下载完成但文件不存在: {output_path}")
        
        file_size = output_path.stat().st_size
        print(f"  ✅ 下载成功: {file_size / 1024 / 1024:.2f}MB")
        
        return str(output_path), file_size
        
    except Exception as e:
        print(f"  ❌ 下载失败: {e}")
        raise


def upload_to_r2(file_path, bvid):
    """上传音频到R2"""
    key = f'audio/{bvid}.m4a'
    
    print(f"  ⬆️  开始上传到R2: {key}")
    
    try:
        s3.upload_file(
            file_path,
            R2_BUCKET,
            key,
            ExtraArgs={
                'ContentType': 'audio/mp4',
            }
        )
        
        # 生成公开URL
        audio_url = f'https://pub-{R2_BUCKET}.r2.dev/{key}'
        print(f"  ✅ 上传成功: {audio_url}")
        
        return audio_url
        
    except Exception as e:
        print(f"  ❌ 上传失败: {e}")
        raise


def update_status(item_id, status, **kwargs):
    """更新下载状态"""
    fields = [f'status = ?']
    params = [status]
    
    if 'audio_url' in kwargs:
        fields.append('audio_url = ?')
        params.append(kwargs['audio_url'])
    
    if 'file_size' in kwargs:
        fields.append('file_size = ?')
        params.append(kwargs['file_size'])
    
    if 'error_message' in kwargs:
        fields.append('error_message = ?')
        params.append(kwargs['error_message'])
    
    if status == 'downloading':
        fields.append('last_attempt = ?')
        params.append(int(time.time() * 1000))
    
    if status == 'completed':
        fields.append('completed_at = ?')
        params.append(int(time.time() * 1000))
    
    if status == 'failed':
        fields.append('retry_count = retry_count + 1')
    
    params.append(item_id)
    
    sql = f"UPDATE download_queue SET {', '.join(fields)} WHERE id = ?"
    
    try:
        query_d1(sql, params)
    except Exception as e:
        print(f"  ⚠️  更新状态失败: {e}")


def main():
    print("=" * 60)
    print("B-Cast MVP 下载Worker")
    print("=" * 60)
    print()
    
    # 1. 查询待下载队列
    print("📋 查询待下载队列...")
    try:
        result = query_d1("""
            SELECT * FROM download_queue 
            WHERE status = 'pending'
            ORDER BY added_at ASC
            LIMIT 50
        """)
        
        queue_items = result.get('results', [])
        
        if not queue_items:
            print("✅ 没有待下载的项目")
            return
        
        print(f"📥 找到 {len(queue_items)} 个待下载项目")
        print()
        
    except Exception as e:
        print(f"❌ 查询队列失败: {e}")
        return
    
    # 2. 逐个下载
    success_count = 0
    failed_count = 0
    
    for i, item in enumerate(queue_items, 1):
        item_id = item['id']
        bvid = item['bvid']
        title = item['title']
        
        print(f"[{i}/{len(queue_items)}] 处理: {title}")
        print(f"  BVID: {bvid}")
        
        try:
            # 更新状态为downloading
            update_status(item_id, 'downloading')
            
            # 下载音频
            file_path, file_size = download_audio(bvid, title)
            
            # 上传到R2
            audio_url = upload_to_r2(file_path, bvid)
            
            # 更新状态为completed
            update_status(
                item_id,
                'completed',
                audio_url=audio_url,
                file_size=file_size
            )
            
            # 清理临时文件
            try:
                os.remove(file_path)
            except:
                pass
            
            success_count += 1
            print(f"  ✅ 完成")
            
        except Exception as e:
            # 更新状态为failed
            update_status(
                item_id,
                'failed',
                error_message=str(e)[:500]
            )
            
            failed_count += 1
            print(f"  ❌ 失败: {e}")
        
        print()
        
        # 避免请求过快
        if i < len(queue_items):
            time.sleep(2)
    
    # 3. 总结
    print("=" * 60)
    print(f"✅ 成功: {success_count}")
    print(f"❌ 失败: {failed_count}")
    print(f"📊 总计: {len(queue_items)}")
    print("=" * 60)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 未知错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
