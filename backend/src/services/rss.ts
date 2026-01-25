// RSS 2.0 XML生成服务
// 参考 RSSHub 的标准实现，支持 iTunes Podcast 标签

export interface RSSChannel {
  title: string;
  link: string;
  description: string;
  language?: string;
  author?: string;
  image?: {
    url: string;
    title: string;
    link: string;
  };
  category?: string[];
}

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  guid: string;
  author?: string;
  category?: string[];
  enclosure?: {
    url: string;
    length: number;
    type: string;
  };
  // iTunes Podcast 扩展字段
  itunes?: {
    duration?: number;
    image?: string;
    explicit?: boolean;
    author?: string;
    subtitle?: string;
    summary?: string;
  };
}

/**
 * 转义XML特殊字符
 */
function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 使用CDATA包裹内容（推荐用于文本内容）
 */
function wrapCDATA(content: string): string {
  if (!content) return '';
  // 确保CDATA内容安全
  return `<![CDATA[${String(content).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * 格式化时长为 iTunes duration 格式 (HH:MM:SS 或 MM:SS)
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * 生成标准的 RSS 2.0 XML（支持 iTunes Podcast 扩展）
 * 参考 RSSHub 的实现：https://github.com/DIYgod/RSSHub
 */
export function generateRSS(channel: RSSChannel, items: RSSItem[]): string {
  const now = new Date().toUTCString();
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" ';
  xml += 'xmlns:atom="http://www.w3.org/2005/Atom" ';
  xml += 'xmlns:content="http://purl.org/rss/1.0/modules/content/" ';
  xml += 'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"';
  xml += '>\n';
  
  xml += '  <channel>\n';
  
  // 基本频道信息
  xml += `    <title>${wrapCDATA(channel.title)}</title>\n`;
  xml += `    <link>${escapeXml(channel.link)}</link>\n`;
  xml += `    <atom:link href="${escapeXml(channel.link)}" rel="self" type="application/rss+xml" />\n`;
  xml += `    <description>${wrapCDATA(channel.description)}</description>\n`;
  xml += `    <language>${channel.language || 'zh-cn'}</language>\n`;
  xml += `    <lastBuildDate>${now}</lastBuildDate>\n`;
  xml += `    <ttl>60</ttl>\n`;
  xml += `    <generator>B-Cast (RSSHub-compatible)</generator>\n`;
  
  // iTunes Podcast 扩展
  if (channel.author) {
    xml += `    <itunes:author>${wrapCDATA(channel.author)}</itunes:author>\n`;
  }
  xml += `    <itunes:explicit>false</itunes:explicit>\n`;
  
  // 频道图片
  if (channel.image) {
    xml += '    <image>\n';
    xml += `      <url>${escapeXml(channel.image.url)}</url>\n`;
    xml += `      <title>${wrapCDATA(channel.image.title)}</title>\n`;
    xml += `      <link>${escapeXml(channel.image.link)}</link>\n`;
    xml += '    </image>\n';
    
    // iTunes 图片
    xml += `    <itunes:image href="${escapeXml(channel.image.url)}" />\n`;
  }
  
  // 分类
  if (channel.category && channel.category.length > 0) {
    for (const cat of channel.category) {
      xml += `    <category>${wrapCDATA(cat)}</category>\n`;
      xml += `    <itunes:category text="${escapeXml(cat)}" />\n`;
    }
  }
  
  // 添加RSS项目
  for (const item of items) {
    xml += '    <item>\n';
    xml += `      <title>${wrapCDATA(item.title)}</title>\n`;
    xml += `      <link>${escapeXml(item.link)}</link>\n`;
    xml += `      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>\n`;
    xml += `      <pubDate>${item.pubDate.toUTCString()}</pubDate>\n`;
    
    // 描述（使用CDATA）
    xml += `      <description>${wrapCDATA(item.description)}</description>\n`;
    
    // 作者
    if (item.author) {
      xml += `      <author>${wrapCDATA(item.author)}</author>\n`;
      xml += `      <itunes:author>${wrapCDATA(item.author)}</itunes:author>\n`;
    }
    
    // 分类
    if (item.category && item.category.length > 0) {
      for (const cat of item.category) {
        xml += `      <category>${wrapCDATA(cat)}</category>\n`;
      }
    }
    
    // iTunes 扩展字段
    if (item.itunes) {
      if (item.itunes.duration) {
        xml += `      <itunes:duration>${formatDuration(item.itunes.duration)}</itunes:duration>\n`;
      }
      if (item.itunes.image) {
        xml += `      <itunes:image href="${escapeXml(item.itunes.image)}" />\n`;
      }
      if (item.itunes.subtitle) {
        xml += `      <itunes:subtitle>${wrapCDATA(item.itunes.subtitle)}</itunes:subtitle>\n`;
      }
      if (item.itunes.summary) {
        xml += `      <itunes:summary>${wrapCDATA(item.itunes.summary)}</itunes:summary>\n`;
      }
      xml += `      <itunes:explicit>${item.itunes.explicit ? 'yes' : 'no'}</itunes:explicit>\n`;
    }
    
    // 音频附件（如果已下载）
    if (item.enclosure) {
      xml += `      <enclosure url="${escapeXml(item.enclosure.url)}" `;
      xml += `length="${item.enclosure.length}" `;
      xml += `type="${escapeXml(item.enclosure.type)}" />\n`;
    }
    
    xml += '    </item>\n';
  }
  
  xml += '  </channel>\n';
  xml += '</rss>';
  
  return xml;
}

/**
 * 从B站播放列表数据生成RSS（支持Podcast格式）
 */
export function generateRSSFromBilibili(
  playlist: {
    name: string;
    type: string;
    uploaderName: string;
    cover?: string;
    description?: string;
  },
  items: Array<{
    bvid: string;
    title: string;
    duration: number;
    cover: string;
    pubDate: number;
    audioUrl?: string;
    fileSize?: number;
  }>,
  baseUrl: string  // RSS订阅的base URL
): string {
  // 构建频道信息
  const channel: RSSChannel = {
    title: playlist.name,
    link: baseUrl,
    description: playlist.description || `${playlist.uploaderName} 的B站内容订阅`,
    language: 'zh-cn',
    author: playlist.uploaderName,
    category: ['Technology', 'Education'], // 可根据实际情况调整
  };
  
  if (playlist.cover) {
    channel.image = {
      url: playlist.cover,
      title: playlist.name,
      link: baseUrl,
    };
  }
  
  // 构建项目列表
  const rssItems: RSSItem[] = items.map(item => {
    const hours = Math.floor(item.duration / 3600);
    const minutes = Math.floor((item.duration % 3600) / 60);
    const seconds = item.duration % 60;
    
    let durationText = '';
    if (hours > 0) {
      durationText = `${hours}小时${minutes}分${seconds}秒`;
    } else if (minutes > 0) {
      durationText = `${minutes}分${seconds}秒`;
    } else {
      durationText = `${seconds}秒`;
    }
    
    const rssItem: RSSItem = {
      title: item.title,
      link: `https://www.bilibili.com/video/${item.bvid}`,
      description: `时长: ${durationText}\nBVID: ${item.bvid}`,
      pubDate: new Date(item.pubDate),
      guid: item.bvid,
      author: playlist.uploaderName,
      itunes: {
        duration: item.duration,
        image: item.cover,
        explicit: false,
        author: playlist.uploaderName,
        subtitle: `时长: ${durationText}`,
        summary: item.title,
      },
    };
    
    // 如果音频已下载，添加enclosure
    if (item.audioUrl && item.fileSize) {
      rssItem.enclosure = {
        url: item.audioUrl,
        length: item.fileSize,
        type: 'audio/mp4',
      };
    }
    
    return rssItem;
  });
  
  return generateRSS(channel, rssItems);
}

/**
 * 解析RSS XML获取items（用于检查更新）
 */
export interface ParsedRSSItem {
  title: string;
  link: string;
  pubDate: Date;
  guid: string;
}

export function parseRSS(xmlContent: string): ParsedRSSItem[] {
  const items: ParsedRSSItem[] = [];
  
  // 简单的XML解析（Workers环境限制）
  const itemMatches = xmlContent.matchAll(/<item>([\s\S]*?)<\/item>/g);
  
  for (const match of itemMatches) {
    const itemContent = match[1];
    
    // 支持CDATA格式
    const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
    const guidMatch = itemContent.match(/<guid[^>]*>(.*?)<\/guid>/);
    
    if (titleMatch && linkMatch && pubDateMatch && guidMatch) {
      items.push({
        title: titleMatch[1] || titleMatch[2] || '',
        link: linkMatch[1] || '',
        pubDate: new Date(pubDateMatch[1] || ''),
        guid: guidMatch[1] || '',
      });
    }
  }
  
  return items;
}
