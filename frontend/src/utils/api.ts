const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function apiCall<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}
