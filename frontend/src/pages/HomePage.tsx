import { useState, useEffect } from 'react';
import { db, Playlist } from '../db';
import { AddPlaylist } from '../components/AddPlaylist';
import { PlaylistCard } from '../components/PlaylistCard';

export function HomePage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      const playlists = await db.playlists.orderBy('createdAt').reverse().toArray();
      setPlaylists(playlists);
    } catch (error) {
      console.error('加载播放列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">B-Cast</h1>
          <p className="text-gray-600">音频播放列表管理 - MVP版本</p>
        </div>

        <AddPlaylist onSuccess={loadPlaylists} />

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 mb-2">暂无播放列表</p>
            <p className="text-sm text-gray-400">在上方添加一个B站URL开始使用</p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold mb-4">我的播放列表</h2>
            {playlists.map(playlist => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onDelete={loadPlaylists}
              />
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold mb-2">💡 如何下载音频？</h3>
          <ol className="text-sm space-y-1 list-decimal list-inside text-gray-700">
            <li>添加播放列表后，视频会自动加入下载队列</li>
            <li>前往GitHub仓库的 Actions 标签页</li>
            <li>选择 "Download Audio (MVP)" workflow</li>
            <li>点击 "Run workflow" 按钮手动触发下载</li>
            <li>等待任务完成后，刷新页面查看结果</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
