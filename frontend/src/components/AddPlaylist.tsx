import { useState } from 'react';
import { apiCall, generateId } from '../utils/api';
import { db } from '../db';

interface AddPlaylistProps {
  onSuccess: () => void;
}

export function AddPlaylist({ onSuccess }: AddPlaylistProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setLoading(true);
    setError('');

    try {
      // 调用新的订阅API（会自动生成RSS并保存到R2）
      const addRes = await apiCall('/api/subscriptions/add', {
        method: 'POST',
        body: JSON.stringify({ url })
      });

      if (!addRes.success) {
        throw new Error(addRes.error || '添加失败');
      }

      const { id, name, rssUrl, itemCount } = addRes.data;

      // 为了保持前端本地缓存，我们还需要获取详细信息
      const detailRes = await apiCall(`/api/subscriptions/${id}`);
      
      if (!detailRes.success) {
        throw new Error('获取订阅详情失败');
      }

      const { subscription, items } = detailRes.data;

      // 保存到IndexedDB（用于前端展示）
      await db.playlists.add({
        id: id,
        name: subscription.name,
        type: subscription.type,
        bilibiliUrl: subscription.bilibili_url,
        rssUrl: rssUrl, // 保存RSS地址
        uploaderName: subscription.uploader_name,
        cover: subscription.cover,
        description: subscription.description,
        createdAt: subscription.created_at
      });

      const playlistItems = items.map((item: any) => ({
        id: item.id,
        playlistId: id,
        bvid: item.bvid,
        title: item.title,
        duration: item.duration,
        cover: item.cover,
        pubDate: item.pub_date,
        downloadStatus: item.download_status || 'pending',
        audioUrl: item.audio_url,
        addedAt: item.added_at
      }));

      await db.playlistItems.bulkAdd(playlistItems);

      setUrl('');
      alert(`添加成功！\n\n📋 ${name}\n🎵 ${itemCount} 个视频\n\n📡 RSS地址已复制到播放列表中\n\n💡 请前往GitHub Actions手动触发下载任务`);
      onSuccess();

    } catch (err: any) {
      setError(err.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">添加播放列表</h2>
      
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="输入B站URL（合集/UP主空间/单个视频）"
        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
      />

      {error && (
        <div className="mb-3 text-red-600 text-sm bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={loading || !url}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '解析中...' : '添加'}
      </button>

      <div className="mt-4 text-sm text-gray-600">
        <p className="font-medium mb-2">支持的URL类型：</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>UP主空间: https://space.bilibili.com/123456</li>
          <li>合集: https://space.bilibili.com/123456/channel/collectiondetail?sid=789</li>
          <li>单个视频: https://www.bilibili.com/video/BV1xx4y1x7xx</li>
        </ul>
      </div>
    </div>
  );
}
