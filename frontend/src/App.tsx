import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DownloadsPage } from './pages/DownloadsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {/* 简单导航 */}
        <nav className="bg-white shadow-sm border-b">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-8">
                <Link to="/" className="font-bold text-xl text-blue-600">
                  B-Cast
                </Link>
                <div className="flex space-x-4">
                  <Link
                    to="/"
                    className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    播放列表
                  </Link>
                  <Link
                    to="/downloads"
                    className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    下载队列
                  </Link>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                MVP v0.1.0
              </div>
            </div>
          </div>
        </nav>

        {/* 路由 */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
