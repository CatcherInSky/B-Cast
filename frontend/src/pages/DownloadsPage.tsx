import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiCall, formatFileSize, formatDate } from '../utils/api';

interface DownloadItem {
  id: string;
  bvid: string;
  title: string;
  status: string;
  audioUrl?: string;
  fileSize?: number;
  error?: string;
  addedAt: number;
  completedAt?: number;
}

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiCall<{ items: DownloadItem[] }>('/api/downloads/list');
      setDownloads(res.items || []);
    } catch (err) {
      console.error('加载失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloaded':
        return 'bg-green-100 text-green-800';
      case 'downloading':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待下载';
      case 'downloading': return '下载中';
      case 'downloaded': return '已完成';
      case 'failed': return '失败';
      default: return status;
    }
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
                className="text-gray-600 hover:text-gray-900"
              >
                播放列表
              </Link>
              <Link 
                to="/downloads" 
                className="text-gray-900 font-medium"
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
          {/* 页面标题和操作 */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">下载队列</h2>
            <button 
              onClick={loadDownloads} 
              className="btn-secondary"
              disabled={loading}
            >
              {loading ? '加载中...' : '🔄 刷新'}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="card bg-red-50 border-red-200">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* 下载列表 */}
          {loading && downloads.length === 0 ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : downloads.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">暂无下载记录</p>
              <Link to="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                前往添加播放列表 →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {downloads.map(item => (
                <div key={item.id} className="card">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      <div className="text-sm text-gray-500 mt-1">{item.bvid}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {formatDate(item.addedAt)}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 space-y-1">
                      <div>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                          {getStatusText(item.status)}
                        </span>
                      </div>
                      
                      {item.fileSize && (
                        <div className="text-xs text-gray-500">
                          {formatFileSize(item.fileSize)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 错误信息 */}
                  {item.error && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                      {item.error}
                    </div>
                  )}

                  {/* 音频链接 */}
                  {item.audioUrl && (
                    <div className="mt-2">
                      <a
                        href={item.audioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        查看音频文件 →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 使用说明 */}
          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-bold mb-2">📖 如何触发下载？</h3>
            <ol className="text-sm space-y-1 list-decimal list-inside text-gray-700">
              <li>前往GitHub仓库的 <strong>Actions</strong> 标签页</li>
              <li>选择 <strong>"Download Audio (MVP)"</strong> workflow</li>
              <li>点击 <strong>"Run workflow"</strong> 按钮</li>
              <li>等待任务完成后，刷新此页面查看结果</li>
            </ol>
            <p className="text-xs text-gray-600 mt-3">
              💡 提示：GitHub Actions免费额度为2000分钟/月，请合理使用。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
