// IndexedDB Schema using Dexie.js
import Dexie, { Table } from 'dexie';

export interface Playlist {
  id: string;
  name: string;
  type: 'collection' | 'uploader';
  bilibiliUrl: string;
  rssUrl?: string; // RSS订阅地址
  uploaderName: string;
  cover?: string;
  description?: string;
  createdAt: number;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  bvid: string;
  title: string;
  duration: number;
  cover: string;
  pubDate: number;
  downloadStatus: 'pending' | 'downloading' | 'downloaded' | 'failed';
  audioUrl?: string;
  fileSize?: number;
  addedAt: number;
}

export class BCastDB extends Dexie {
  playlists!: Table<Playlist>;
  playlistItems!: Table<PlaylistItem>;
  
  constructor() {
    super('b-cast-mvp');
    this.version(1).stores({
      playlists: 'id, name, createdAt',
      playlistItems: 'id, playlistId, bvid, downloadStatus, addedAt'
    });
  }
}

export const db = new BCastDB();
