import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { AddPlaylist } from '../components/AddPlaylist';
import { PlaylistCard } from '../components/PlaylistCard';

export function HomePage() {
  const playlists = useLiveQuery(() => db.playlists.orderBy('createdAt').reverse().toArray());
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">B-Cast MVP</h1>
            <nav className="flex gap-4">
              <Link 
                to="/" 
                className="text-gray-900 font-medium"
              >
                播放列表
              </Link>
              <Link 
                to="/downloads" 
                className="text-gray-600 hover:text-gray-900"
              >
                下载状态
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* 添加播放列表 */}
          <AddPlaylist onSuccess={handleSuccess} />

          {/* 播放列表列表 */}
          <div>
            <h2 className="text-xl font-bold mb-4">我的播放列表</h2>
            
            {!playlists ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : playlists.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-gray-500 mb-4">还没有播放列表</p>
                <p className="text-sm text-gray-400">在上方输入B站URL添加第一个播放列表吧！</p>
              </div>
            ) : (
              <div className="space-y-4">
                {playlists.map(playlist => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    onDelete={handleSuccess}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 pb-8 text-center text-sm text-gray-500">
        <p>B-Cast MVP - 开源的个人音频播放器</p>
        <p className="mt-1">
          <a 
            href="https://github.com/YOUR_USERNAME/B-Cast" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
