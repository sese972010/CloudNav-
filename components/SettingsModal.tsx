
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Bot, Key, Globe, Sparkles, PauseCircle, Wrench, Box, Copy, Check, List, GripVertical, Filter, LayoutTemplate, RefreshCw, Info, Download, Sidebar, Keyboard, MousePointerClick, AlertTriangle, Package } from 'lucide-react';
import { AIConfig, LinkItem, Category, SiteSettings } from '../types';
import { generateLinkDescription } from '../services/geminiService';
import JSZip from 'jszip';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  siteSettings: SiteSettings;
  onSave: (config: AIConfig, siteSettings: SiteSettings) => void;
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
}

// 辅助函数：生成随机 HSL 颜色
const getRandomColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = 70 + Math.random() * 20; // 70-90% saturation
    const l = 45 + Math.random() * 15; // 45-60% lightness
    return `hsl(${h}, ${s}%, ${l}%)`;
};

// 辅助函数：生成 SVG Data URI 图标 (支持自定义颜色)
const generateSvgIcon = (text: string, color1: string, color2: string) => {
    const char = (text && text.length > 0 ? text.charAt(0) : 'C').toUpperCase();
    
    const gradientId = 'g_' + Math.random().toString(36).substr(2, 9);

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <defs>
            <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="${color1}"/>
                <stop offset="100%" stop-color="${color2}"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#${gradientId})" rx="16"/>
        <text x="50%" y="50%" dy=".35em" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="32" text-anchor="middle">${char}</text>
    </svg>`.trim();

    try {
        const encoded = window.btoa(unescape(encodeURIComponent(svg)));
        return `data:image/svg+xml;base64,${encoded}`;
    } catch (e) {
        console.error("SVG Icon Generation Failed", e);
        return '';
    }
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, config, siteSettings, onSave, links, categories, onUpdateLinks 
}) => {
  const [activeTab, setActiveTab] = useState<'site' | 'ai' | 'tools' | 'links'>('site');
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  
  const [localSiteSettings, setLocalSiteSettings] = useState<SiteSettings>(() => ({
      title: siteSettings?.title || 'CloudNav - 我的导航',
      navTitle: siteSettings?.navTitle || 'CloudNav',
      favicon: siteSettings?.favicon || '',
      cardStyle: siteSettings?.cardStyle || 'detailed'
  }));
  
  const [generatedIcons, setGeneratedIcons] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const shouldStopRef = useRef(false);

  // Tools State
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [browserType, setBrowserType] = useState<'chrome' | 'firefox'>('chrome');
  const [isZipping, setIsZipping] = useState(false);
  
  // Link Management State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  const availableCategories = useMemo(() => {
      const catIds = Array.from(new Set(links.map(l => l.categoryId)));
      return catIds;
  }, [links]);

  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});

  const updateGeneratedIcons = (text: string) => {
      const newIcons: string[] = [];
      for (let i = 0; i < 6; i++) {
          const c1 = getRandomColor();
          const h2 = (parseInt(c1.split(',')[0].split('(')[1]) + 30 + Math.random() * 30) % 360;
          const c2 = `hsl(${h2}, 70%, 50%)`;
          newIcons.push(generateSvgIcon(text, c1, c2));
      }
      setGeneratedIcons(newIcons);
  };

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      const safeSettings = {
          title: siteSettings?.title || 'CloudNav - 我的导航',
          navTitle: siteSettings?.navTitle || 'CloudNav',
          favicon: siteSettings?.favicon || '',
          cardStyle: siteSettings?.cardStyle || 'detailed'
      };
      setLocalSiteSettings(safeSettings);
      if (generatedIcons.length === 0) {
          updateGeneratedIcons(safeSettings.navTitle);
      }

      setIsProcessing(false);
      setIsZipping(false);
      setProgress({ current: 0, total: 0 });
      shouldStopRef.current = false;
      setDomain(window.location.origin);
      const storedToken = localStorage.getItem('cloudnav_auth_token');
      if (storedToken) setPassword(storedToken);
      setDraggedId(null);
      setFilterCategory('all');
    }
  }, [isOpen, config, siteSettings]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSiteChange = (key: keyof SiteSettings, value: string) => {
    setLocalSiteSettings(prev => {
        const next = { ...prev, [key]: value };
        return next;
    });
  };

  const handleSave = () => {
    onSave(localConfig, localSiteSettings);
    onClose();
  };

  const handleBulkGenerate = async () => {
    if (!localConfig.apiKey) {
        alert("请先配置并保存 API Key");
        return;
    }

    const missingLinks = links.filter(l => !l.description);
    if (missingLinks.length === 0) {
        alert("所有链接都已有描述！");
        return;
    }

    if (!confirm(`发现 ${missingLinks.length} 个链接缺少描述，确定要使用 AI 自动生成吗？这可能需要一些时间。`)) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: missingLinks.length });
    
    let currentLinks = [...links];

    for (let i = 0; i < missingLinks.length; i++) {
        if (shouldStopRef.current) break;

        const link = missingLinks[i];
        try {
            const desc = await generateLinkDescription(link.title, link.url, localConfig);
            currentLinks = currentLinks.map(l => l.id === link.id ? { ...l, description: desc } : l);
            onUpdateLinks(currentLinks);
            setProgress({ current: i + 1, total: missingLinks.length });
        } catch (e) {
            console.error(`Failed to generate for ${link.title}`, e);
        }
    }

    setIsProcessing(false);
  };

  const handleCopy = (text: string, key: string) => {
      navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
          setCopiedStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
  };

  const handleDownloadFile = (filename: string, content: string) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
      e.preventDefault(); 
      if (!draggedId || draggedId === targetId) return;
      
      const newLinks = [...links];
      const sourceIndex = newLinks.findIndex(l => l.id === draggedId);
      const targetIndex = newLinks.findIndex(l => l.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) return;

      const [movedItem] = newLinks.splice(sourceIndex, 1);
      newLinks.splice(targetIndex, 0, movedItem);
      
      onUpdateLinks(newLinks);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDraggedId(null);
  };

  const filteredLinks = useMemo(() => {
      if (filterCategory === 'all') return links;
      return links.filter(l => l.categoryId === filterCategory);
  }, [links, filterCategory]);

  // Extension Generators
  const getManifestJson = () => {
    const json: any = {
        manifest_version: 3,
        name: (localSiteSettings.navTitle || "CloudNav") + " Pro",
        version: "7.1", // Bump version
        minimum_chrome_version: "116",
        description: "CloudNav 侧边栏导航 - 极速响应版",
        permissions: ["activeTab", "scripting", "sidePanel", "storage", "favicon", "contextMenus"],
        background: {
            service_worker: "background.js"
        },
        // 关键改动：恢复 default_popup
        action: {
            default_title: "添加链接到 CloudNav",
            default_popup: "popup.html"
        },
        side_panel: {
            default_path: "sidebar.html"
        },
        icons: {
            "128": "icon.png"
        },
        // 关键改动：将侧边栏开关绑定到自定义命令，而非 _execute_action
        commands: {
          "toggle_sidebar": {
            "suggested_key": {
              "default": "Ctrl+Shift+E",
              "mac": "Command+Shift+E"
            },
            "description": "打开/关闭 CloudNav 侧边栏"
          }
        }
    };
    
    if (browserType === 'firefox') {
        json.browser_specific_settings = {
            gecko: {
                id: "cloudnav@example.com",
                strict_min_version: "109.0"
            }
        };
    }
    
    return JSON.stringify(json, null, 2);
  };

  const extBackgroundJs = `// background.js - CloudNav Assistant v7.1

// 存储当前所有打开的侧边栏端口连接
// Key: windowId (数字), Value: Port 对象
const windowPorts = {};

// 1. 监听来自侧边栏的连接 (侧边栏打开时会自动连接)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cloudnav_sidebar') return;

  // 监听侧边栏发来的初始化消息，获取它所在的 windowId
  port.onMessage.addListener((msg) => {
    if (msg.type === 'init' && msg.windowId) {
      // console.log('Sidebar connected for window:', msg.windowId);
      windowPorts[msg.windowId] = port;

      // 当侧边栏断开连接（被手动关闭或窗口关闭）时，清理记录
      port.onDisconnect.addListener(() => {
        // console.log('Sidebar disconnected for window:', msg.windowId);
        if (windowPorts[msg.windowId] === port) {
          delete windowPorts[msg.windowId];
        }
      });
    }
  });
});

// 2. 监听快捷键命令 (Toggle Sidebar)
// 之前是 onClicked，现在左键给了 Popup，所以侧边栏逻辑移到这里
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_sidebar') {
    const window = await chrome.windows.getLastFocused();
    const windowId = window.id;
    const existingPort = windowPorts[windowId];

    if (existingPort) {
        // 【关闭逻辑】：如果端口存在，说明侧边栏是打开的
        // console.log('Toggle: Closing sidebar for window', windowId);
        try {
            existingPort.postMessage({ action: 'close_panel' });
        } catch (e) {
            delete windowPorts[windowId];
            chrome.sidePanel.open({ windowId });
        }
    } else {
        // 【打开逻辑】：端口不存在，直接打开
        // console.log('Toggle: Opening sidebar for window', windowId);
        try {
            await chrome.sidePanel.open({ windowId: windowId });
        } catch (e) {
            console.error('Failed to open sidebar', e);
        }
    }
  }
});

// 3. 右键菜单支持
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save_to_cloudnav",
        title: "保存到 CloudNav",
        contexts: ["page", "link"]
    });
    
    // 确保点击图标不会默认打开侧边栏 (我们要自己控制, 或者让 default_popup 接管)
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "save_to_cloudnav") {
        // 右键直接打开侧边栏 (或者 Popup，但 Manifest V3 不能程序化打开 Popup)
        // 我们打开侧边栏并传递一个参数让它进入添加模式 (可选优化)
        if (tab && tab.windowId) {
            chrome.sidePanel.open({ windowId: tab.windowId });
        }
    }
});
`;

  // Popup 逻辑 - 恢复快速添加功能
  const extPopupHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { width: 320px; font-family: -apple-system, sans-serif; padding: 16px; margin: 0; background: #f8fafc; color: #1e293b; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .title { font-weight: 600; font-size: 16px; }
        .form-group { margin-bottom: 12px; }
        label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #64748b; }
        input, select, textarea { width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none; }
        input:focus, select:focus, textarea:focus { border-color: #3b82f6; ring: 2px solid #eff6ff; }
        button { width: 100%; background: #3b82f6; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #2563eb; }
        button:disabled { background: #cbd5e1; cursor: not-allowed; }
        .status { margin-top: 8px; font-size: 12px; text-align: center; height: 16px; }
        .success { color: #10b981; }
        .error { color: #ef4444; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">保存到 CloudNav</div>
    </div>
    <div id="loading" class="status">加载中...</div>
    <div id="form" class="hidden">
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="title" placeholder="网站标题">
        </div>
        <div class="form-group">
            <label>URL</label>
            <input type="text" id="url" readonly>
        </div>
        <div class="form-group">
            <label>分类</label>
            <select id="category"></select>
        </div>
        <button id="saveBtn">保存链接</button>
        <div id="status" class="status"></div>
    </div>
    <div id="auth-error" class="hidden">
        <p style="font-size:13px; color:#ef4444; text-align:center;">未检测到登录信息。</p>
        <p style="font-size:12px; color:#64748b; text-align:center;">请先打开侧边栏 (Ctrl+Shift+E) 并完成登录。</p>
        <button id="openSidebar">打开侧边栏</button>
    </div>
    <script src="popup.js"></script>
</body>
</html>`;

  const extPopupJs = `
const CONFIG = {
  apiBase: "${domain}",
  password: "${password}"
};
const CACHE_KEY = 'cloudnav_data';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form');
    const loading = document.getElementById('loading');
    const authError = document.getElementById('auth-error');
    const status = document.getElementById('status');
    const saveBtn = document.getElementById('saveBtn');
    
    // Elements
    const titleInput = document.getElementById('title');
    const urlInput = document.getElementById('url');
    const catSelect = document.getElementById('category');

    // 1. Get Current Tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        titleInput.value = tab.title || '';
        urlInput.value = tab.url || '';
    }

    // 2. Check Auth & Load Categories
    if (!CONFIG.password) {
        // Try fallback to local storage if user logged in via sidebar
        // Note: localStorage in popup/sidebar/background is shared in extensions
        // But CONFIG is hardcoded during download. 
        // We will assume if password is empty in config, check chrome.storage
    }

    try {
        let categories = [];
        // Try local cache first
        const cached = await chrome.storage.local.get(CACHE_KEY);
        if (cached[CACHE_KEY] && cached[CACHE_KEY].categories) {
            categories = cached[CACHE_KEY].categories;
        } else {
             // If no cache, try fetch (might fail if no password)
             const res = await fetch(\`\${CONFIG.apiBase}/api/storage\`, {
                headers: { 'x-auth-password': CONFIG.password }
             });
             if (res.ok) {
                 const data = await res.json();
                 categories = data.categories || [];
             }
        }

        if (categories.length === 0 && !CONFIG.password) {
            throw new Error("No Auth");
        }
        
        // Populate Select
        if (categories.length === 0) {
            const opt = document.createElement('option');
            opt.value = 'common';
            opt.text = '默认分类';
            catSelect.appendChild(opt);
        } else {
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.text = c.name;
                catSelect.appendChild(opt);
            });
        }

        loading.classList.add('hidden');
        form.classList.remove('hidden');

    } catch (e) {
        loading.classList.add('hidden');
        authError.classList.remove('hidden');
    }

    // 3. Save Handler
    saveBtn.addEventListener('click', async () => {
        const title = titleInput.value;
        const url = urlInput.value;
        const categoryId = catSelect.value;

        if(!title || !url) return;

        saveBtn.disabled = true;
        saveBtn.innerText = '保存中...';

        try {
            // Get Icon
            let iconUrl = '';
            try {
                const urlObj = new URL(url);
                iconUrl = \`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=\${encodeURIComponent(urlObj.origin)}&size=128\`;
            } catch(e) {}

            const res = await fetch(\`\${CONFIG.apiBase}/api/link\`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-password': CONFIG.password
                },
                body: JSON.stringify({
                    title,
                    url,
                    categoryId,
                    icon: iconUrl
                })
            });

            if (res.ok) {
                status.className = 'status success';
                status.innerText = '保存成功!';
                setTimeout(() => window.close(), 1000);
                
                // Trigger sidebar refresh if open
                chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
            } else {
                throw new Error('Save failed');
            }
        } catch (e) {
            status.className = 'status error';
            status.innerText = '保存失败，请检查网络或密码';
            saveBtn.disabled = false;
            saveBtn.innerText = '保存链接';
        }
    });

    document.getElementById('openSidebar').addEventListener('click', () => {
        chrome.windows.getCurrent((win) => {
             chrome.sidePanel.open({ windowId: win.id });
        });
    });
});
`;

  const extSidebarHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        :root {
            --bg: #ffffff;
            --text: #1e293b;
            --border: #e2e8f0;
            --hover: #f1f5f9;
            --accent: #3b82f6;
            --muted: #64748b;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --text: #f1f5f9;
                --border: #334155;
                --hover: #1e293b;
                --accent: #60a5fa;
                --muted: #94a3b8;
            }
        }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding-bottom: 20px; width: 100%; box-sizing: border-box; }
        
        .header { position: sticky; top: 0; padding: 10px 12px; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 10; display: flex; gap: 8px; }
        .search-input { flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--hover); color: var(--text); outline: none; box-sizing: border-box; font-size: 13px; }
        .search-input:focus { border-color: var(--accent); }
        
        .refresh-btn { width: 30px; display: flex; items-center; justify-content: center; border: 1px solid var(--border); background: var(--hover); border-radius: 6px; color: var(--muted); cursor: pointer; transition: all 0.2s; }
        .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
        .refresh-btn:active { transform: scale(0.95); }
        .rotating { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .content { padding: 4px; }
        .cat-group { margin-bottom: 2px; }
        .cat-header { 
            padding: 8px 10px; font-size: 13px; font-weight: 600; color: var(--text); 
            cursor: pointer; display: flex; items-center; gap: 8px; border-radius: 6px;
            user-select: none; transition: background 0.1s;
        }
        .cat-header:hover { background: var(--hover); }
        .cat-arrow { width: 14px; height: 14px; color: var(--muted); transition: transform 0.2s; }
        .cat-header.active .cat-arrow { transform: rotate(90deg); color: var(--accent); }
        
        /* Ensure links are hidden by default */
        .cat-links { display: none; padding-left: 8px; margin-bottom: 8px; }
        .cat-header.active + .cat-links { display: block; }
        
        .link-item { display: flex; items-center; gap: 8px; padding: 6px 8px; border-radius: 6px; text-decoration: none; color: var(--text); transition: background 0.1s; border-left: 2px solid transparent; }
        .link-item:hover { background: var(--hover); border-left-color: var(--accent); }
        .link-icon { width: 16px; height: 16px; flex-shrink: 0; display: flex; items-center; justify-content: center; overflow: hidden; }
        .link-icon img { width: 100%; height: 100%; object-fit: contain; }
        .link-info { min-width: 0; flex: 1; }
        .link-title { font-size: 13px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
        
        .empty { text-align: center; padding: 20px; color: var(--muted); font-size: 12px; }
        .loading { display: flex; justify-content: center; padding: 40px; color: var(--accent); font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <input type="text" id="search" class="search-input" placeholder="搜索..." autocomplete="off">
        <button id="refresh" class="refresh-btn" title="同步最新数据">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        </button>
    </div>
    <div id="content" class="content">
        <div class="loading">初始化...</div>
    </div>
    <script src="sidebar.js"></script>
</body>
</html>`;

  const extSidebarJs = `const CONFIG = {
  apiBase: "${domain}",
  password: "${password}"
};
const CACHE_KEY = 'cloudnav_data';

// --- 核心改动：连接与自关闭逻辑 (参考 115) ---
let port = null;
try {
    // 1. 建立长连接
    port = chrome.runtime.connect({ name: 'cloudnav_sidebar' });
    
    // 2. 获取当前窗口ID并发送给后台，建立绑定关系
    chrome.windows.getCurrent((win) => {
        if (win && port) {
            port.postMessage({ type: 'init', windowId: win.id });
        }
    });

    // 3. 监听关闭指令
    port.onMessage.addListener((msg) => {
        if (msg.action === 'close_panel') {
            console.log('Received close command, closing window.');
            window.close(); // 只有在扩展页面内部调用有效
        }
    });
} catch(e) {
    console.error('Connection failed', e);
}
// ----------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('content');
    const searchInput = document.getElementById('search');
    const refreshBtn = document.getElementById('refresh');
    
    let allLinks = [];
    let allCategories = [];
    let expandedCats = new Set(); 

    const getArrowIcon = () => {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cat-arrow"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    };

    const getFaviconUrl = (pageUrl) => {
        try {
            const url = new URL(chrome.runtime.getURL("/_favicon/"));
            url.searchParams.set("pageUrl", pageUrl);
            url.searchParams.set("size", "32");
            return url.toString();
        } catch (e) {
            return '';
        }
    };

    const toggleCat = (id) => {
        const header = document.querySelector(\`.cat-header[data-id="\${id}"]\`);
        if (header) {
            header.classList.toggle('active');
            if (header.classList.contains('active')) {
                expandedCats.add(id);
            } else {
                expandedCats.delete(id);
            }
        }
    };

    container.addEventListener('click', (e) => {
        const header = e.target.closest('.cat-header');
        if (header) {
            toggleCat(header.dataset.id);
        }
    });

    const render = (filter = '') => {
        const q = filter.toLowerCase();
        let html = '';
        let hasContent = false;
        
        const isSearching = q.length > 0;

        allCategories.forEach(cat => {
            const catLinks = allLinks.filter(l => {
                const inCat = l.categoryId === cat.id;
                if (!inCat) return false;
                if (!q) return true;
                return l.title.toLowerCase().includes(q) || 
                       l.url.toLowerCase().includes(q) || 
                       (l.description && l.description.toLowerCase().includes(q));
            });

            if (catLinks.length === 0) return;
            hasContent = true;

            const isOpen = expandedCats.has(cat.id) || isSearching;
            const activeClass = isOpen ? 'active' : '';

            html += \`
            <div class="cat-group">
                <div class="cat-header \${activeClass}" data-id="\${cat.id}">
                    \${getArrowIcon()}
                    <span>\${cat.name}</span>
                </div>
                <div class="cat-links">
            \`;
            
            catLinks.forEach(link => {
                const iconSrc = getFaviconUrl(link.url);
                html += \`
                    <a href="\${link.url}" target="_blank" class="link-item">
                        <div class="link-icon"><img src="\${iconSrc}" /></div>
                        <div class="link-info">
                            <div class="link-title">\${link.title}</div>
                        </div>
                    </a>
                \`;
            });

            html += \`</div></div>\`;
        });

        if (!hasContent) {
            container.innerHTML = filter ? '<div class="empty">无搜索结果</div>' : '<div class="empty">暂无数据</div>';
        } else {
            container.innerHTML = html;
        }
    };

    const loadData = async (forceRefresh = false) => {
        try {
            if (!forceRefresh) {
                const cached = await chrome.storage.local.get(CACHE_KEY);
                if (cached[CACHE_KEY]) {
                    const data = cached[CACHE_KEY];
                    allLinks = data.links || [];
                    allCategories = data.categories || [];
                    render(searchInput.value);
                    return;
                }
            }

            refreshBtn.classList.add('rotating');
            container.innerHTML = '<div class="loading">同步数据中...</div>';
            
            const res = await fetch(\`\${CONFIG.apiBase}/api/storage\`, {
                headers: { 'x-auth-password': CONFIG.password }
            });
            
            if (!res.ok) throw new Error("Sync failed");
            
            const data = await res.json();
            allLinks = data.links || [];
            allCategories = data.categories || [];
            
            await chrome.storage.local.set({ [CACHE_KEY]: data });
            
            render(searchInput.value);
        } catch (e) {
            container.innerHTML = \`<div class="empty" style="color:#ef4444">加载失败: \${e.message}<br>请点击右上角刷新</div>\`;
        } finally {
            refreshBtn.classList.remove('rotating');
        }
    };

    loadData();

    searchInput.addEventListener('input', (e) => render(e.target.value));
    refreshBtn.addEventListener('click', () => loadData(true));

    // Listen for refresh messages (e.g., from popup add)
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'refresh') {
            loadData(true);
        }
    });
});`;

  const renderCodeBlock = (filename: string, code: string) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300">{filename}</span>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => handleDownloadFile(filename, code)}
                    className="text-xs flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                    title="下载文件"
                >
                    <Download size={12}/>
                    Download
                </button>
                <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>
                <button 
                    onClick={() => handleCopy(code, filename)}
                    className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                    {copiedStates[filename] ? <Check size={12}/> : <Copy size={12}/>}
                    {copiedStates[filename] ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
        <div className="bg-slate-900 p-3 overflow-x-auto">
            <pre className="text-[10px] md:text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                {code}
            </pre>
        </div>
    </div>
  );

  const generateIconBlob = async (): Promise<Blob | null> => {
     const iconUrl = localSiteSettings.favicon;
     if (!iconUrl) return null;

     try {
         const img = new Image();
         img.crossOrigin = "anonymous";
         img.src = iconUrl;

         await new Promise((resolve, reject) => {
             img.onload = resolve;
             img.onerror = reject;
         });

         const canvas = document.createElement('canvas');
         canvas.width = 128;
         canvas.height = 128;
         const ctx = canvas.getContext('2d');
         if (!ctx) throw new Error('Canvas error');

         ctx.drawImage(img, 0, 0, 128, 128);

         return new Promise((resolve) => {
             canvas.toBlob((blob) => {
                 resolve(blob);
             }, 'image/png');
         });

     } catch (e) {
         console.error(e);
         return null;
     }
  };

  const handleDownloadIcon = async () => {
    const blob = await generateIconBlob();
    if (!blob) {
        alert("生成图片失败 (可能是跨域限制)。\n\n请尝试右键点击下方的预览图片，选择 '图片另存为...' 保存。");
        return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "icon.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
        const zip = new JSZip();
        
        // Files
        zip.file("manifest.json", getManifestJson());
        zip.file("background.js", extBackgroundJs);
        zip.file("popup.html", extPopupHtml); 
        zip.file("popup.js", extPopupJs);
        zip.file("sidebar.html", extSidebarHtml);
        zip.file("sidebar.js", extSidebarJs);
        
        // Icon
        const iconBlob = await generateIconBlob();
        if (iconBlob) {
            zip.file("icon.png", iconBlob);
        } else {
            console.warn("Could not generate icon for zip");
            zip.file("icon_missing.txt", "Icon generation failed due to CORS. Please save the icon manually.");
        }

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = "CloudNav-Ext.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch(e) {
        console.error(e);
        alert("打包下载失败");
    } finally {
        setIsZipping(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'site', label: '网站设置', icon: LayoutTemplate },
    { id: 'ai', label: 'AI 设置', icon: Bot },
    { id: 'links', label: '链接管理', icon: List },
    { id: 'tools', label: '扩展工具', icon: Wrench },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 flex max-h-[90vh] flex-col md:flex-row">
        
        {/* Sidebar */}
        <div className="w-full md:w-48 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 flex flex-row md:flex-col p-2 gap-1 overflow-x-auto shrink-0">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        activeTab === tab.id 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                    <tab.icon size={18} />
                    {tab.label}
                </button>
            ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white dark:bg-slate-800">
             <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="text-lg font-semibold dark:text-white">设置</h3>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="w-5 h-5 dark:text-slate-400" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 pb-12">
                
                {/* 1. Site Settings */}
                {activeTab === 'site' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">网页标题 (Title)</label>
                                <input 
                                    type="text" 
                                    value={localSiteSettings.title}
                                    onChange={(e) => handleSiteChange('title', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">导航栏标题</label>
                                <input 
                                    type="text" 
                                    value={localSiteSettings.navTitle}
                                    onChange={(e) => handleSiteChange('navTitle', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">网站图标 (Favicon URL)</label>
                                <div className="flex gap-3 items-center">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
                                        {localSiteSettings.favicon ? <img src={localSiteSettings.favicon} className="w-full h-full object-cover"/> : <Globe size={20} className="text-slate-400"/>}
                                    </div>
                                    <input 
                                        type="text" 
                                        value={localSiteSettings.favicon}
                                        onChange={(e) => handleSiteChange('favicon', e.target.value)}
                                        placeholder="https://example.com/favicon.ico"
                                        className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="mt-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs text-slate-500">选择生成的随机图标 (点击右侧按钮刷新):</p>
                                        <button 
                                            type="button"
                                            onClick={() => updateGeneratedIcons(localSiteSettings.navTitle)}
                                            className="text-xs flex items-center gap-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                                        >
                                            <RefreshCw size={12} /> 随机生成
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        {generatedIcons.map((icon, idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => handleSiteChange('favicon', icon)}
                                                className="w-8 h-8 rounded hover:ring-2 ring-blue-500 transition-all border border-slate-100 dark:border-slate-600"
                                            >
                                                <img src={icon} className="w-full h-full rounded" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. AI Settings */}
                {activeTab === 'ai' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">AI 提供商</label>
                            <select 
                                value={localConfig.provider}
                                onChange={(e) => handleChange('provider', e.target.value)}
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="gemini">Google Gemini</option>
                                <option value="openai">OpenAI Compatible (ChatGPT, DeepSeek, Claude...)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                            <div className="relative">
                                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="password" 
                                    value={localConfig.apiKey}
                                    onChange={(e) => handleChange('apiKey', e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full pl-10 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Key 仅存储在本地浏览器缓存中，不会发送到我们的服务器。</p>
                        </div>

                        {localConfig.provider === 'openai' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base URL (API 地址)</label>
                                <input 
                                    type="text" 
                                    value={localConfig.baseUrl}
                                    onChange={(e) => handleChange('baseUrl', e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">模型名称 (Model Name)</label>
                            <input 
                                type="text" 
                                value={localConfig.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                placeholder={localConfig.provider === 'gemini' ? "gemini-2.5-flash" : "gpt-3.5-turbo"}
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                            <h4 className="text-sm font-semibold mb-2 dark:text-slate-200">批量操作</h4>
                            {isProcessing ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                                        <span>正在生成描述... ({progress.current}/{progress.total})</span>
                                        <button onClick={() => { shouldStopRef.current = true; setIsProcessing(false); }} className="text-red-500 flex items-center gap-1 hover:underline">
                                            <PauseCircle size={12}/> 停止
                                        </button>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    onClick={handleBulkGenerate}
                                    className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-3 py-2 rounded-lg transition-colors border border-purple-200 dark:border-purple-800"
                                >
                                    <Sparkles size={16} /> 一键补全所有缺失的描述
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. Link Manager */}
                {activeTab === 'links' && (
                    <div className="space-y-4 animate-in fade-in duration-300 flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-2">
                            <Filter size={16} className="text-slate-400" />
                            <select 
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="p-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                            >
                                <option value="all">全部分类</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-400 ml-auto">拖拽调整顺序</span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                             {filteredLinks.length === 0 ? (
                                 <div className="text-center py-10 text-slate-400 text-sm">暂无链接</div>
                             ) : (
                                 filteredLinks.map(link => (
                                    <div 
                                        key={link.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, link.id)}
                                        onDragOver={(e) => handleDragOver(e, link.id)}
                                        onDrop={handleDrop}
                                        className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 ${draggedId === link.id ? 'opacity-50 border-blue-400 border-dashed' : 'hover:border-blue-300'}`}
                                    >
                                        <div className="cursor-move text-slate-400 hover:text-slate-600">
                                            <GripVertical size={16} />
                                        </div>
                                        <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-600 flex items-center justify-center text-xs overflow-hidden">
                                            {link.icon ? <img src={link.icon} className="w-full h-full object-cover"/> : link.title.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium dark:text-slate-200 truncate">{link.title}</div>
                                            <div className="text-xs text-slate-400 truncate">{link.url}</div>
                                        </div>
                                        <div className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-600 text-slate-500">
                                            {categories.find(c => c.id === link.categoryId)?.name}
                                        </div>
                                    </div>
                                 ))
                             )}
                        </div>
                    </div>
                )}

                {/* 4. Tools (Extension) - New 3-Step UI */}
                {activeTab === 'tools' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        {/* Step 1 */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">1</span>
                                输入访问密码
                            </h4>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="space-y-3">
                                     <div>
                                        <label className="text-xs text-slate-500 mb-1 block">API 域名 (自动获取)</label>
                                        <code className="block w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 font-mono truncate">
                                            {domain}
                                        </code>
                                     </div>
                                     <div>
                                        <label className="text-xs text-slate-500 mb-1 block">访问密码 (Password)</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                value={password} 
                                                readOnly 
                                                className="flex-1 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm outline-none font-mono"
                                                placeholder="未登录 / 未设置"
                                            />
                                             <button onClick={() => handleCopy(password, 'pwd')} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-blue-500 rounded text-slate-600 dark:text-slate-400 transition-colors">
                                                {copiedStates['pwd'] ? <Check size={16}/> : <Copy size={16}/>}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">此密码对应您部署时设置的 PASSWORD 环境变量。</p>
                                     </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">2</span>
                                选择浏览器类型
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setBrowserType('chrome')}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${browserType === 'chrome' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                >
                                    <span className="font-semibold">Chrome / Edge</span>
                                </button>
                                <button 
                                    onClick={() => setBrowserType('firefox')}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${browserType === 'firefox' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                >
                                    <span className="font-semibold">Mozilla Firefox</span>
                                </button>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="space-y-4">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">3</span>
                                配置步骤与代码
                            </h4>
                            
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h5 className="font-semibold text-sm mb-3 dark:text-slate-200">
                                    安装指南 ({browserType === 'chrome' ? 'Chrome/Edge' : 'Firefox'}):
                                </h5>
                                <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
                                    <li>在电脑上新建文件夹 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">CloudNav-Pro</code>。</li>
                                    <li><strong>[重要]</strong> 将下方图标保存为 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">icon.png</code>。</li>
                                    <li>获取插件代码文件：
                                        <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-slate-500">
                                            <li><strong>方式一 (推荐)：</strong>点击下方的 <span className="text-blue-600 dark:text-blue-400 font-bold">"📦 一键下载所有文件"</span> 按钮，解压到该文件夹。</li>
                                            <li><strong>方式二 (备用)：</strong>分别点击下方代码块的 <Download size={12} className="inline"/> 按钮下载或复制 <code className="bg-white dark:bg-slate-900 px-1 rounded">manifest.json</code>, <code className="bg-white dark:bg-slate-900 px-1 rounded">background.js</code> 等文件到该文件夹。</li>
                                        </ul>
                                    </li>
                                    <li>
                                        打开浏览器扩展管理页面 
                                        {browserType === 'chrome' ? (
                                            <> (Chrome: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">chrome://extensions</code>)</>
                                        ) : (
                                            <> (Firefox: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">about:debugging</code>)</>
                                        )}。
                                    </li>
                                    <li className="text-blue-600 font-bold">操作关键点：</li>
                                    <li>1. 开启右上角的 "开发者模式" (Chrome)。</li>
                                    <li>2. 点击 "加载已解压的扩展程序"，选择包含上述文件的文件夹。</li>
                                    <li>3. 前往 <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">chrome://extensions/shortcuts</code>。</li>
                                    <li>4. <strong>[重要]</strong> 找到 "打开/关闭 CloudNav 侧边栏"，设置快捷键 (如 Ctrl+Shift+E)。</li>
                                </ol>
                                
                                <div className="mt-4 mb-4">
                                    <button 
                                        onClick={handleDownloadZip}
                                        disabled={isZipping}
                                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                                    >
                                        <Package size={20} />
                                        {isZipping ? '打包中...' : '📦 一键下载所有文件 (v7.1 Pro)'}
                                    </button>
                                </div>
                                
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded border border-green-200 dark:border-green-900/50 text-sm space-y-2">
                                    <div className="font-bold flex items-center gap-2"><MousePointerClick size={16}/> 完美交互方案 (v7.1):</div>
                                    <ul className="list-disc list-inside text-xs space-y-1">
                                        <li><strong>左键点击图标:</strong> 弹出 "快速添加" 菜单。</li>
                                        <li><strong>快捷键 (Ctrl+Shift+E):</strong> 切换侧边栏 (自关闭)。</li>
                                        <li><strong>右键菜单:</strong> 增加 "保存到 CloudNav" 选项。</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
                                        {localSiteSettings.favicon ? <img src={localSiteSettings.favicon} className="w-full h-full object-cover"/> : <Globe size={24} className="text-slate-400"/>}
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm dark:text-white">插件图标 (icon.png)</div>
                                        <div className="text-xs text-slate-500">请保存此图片为 icon.png</div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleDownloadIcon}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg transition-colors"
                                >
                                    <Download size={16} /> 下载图标
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <Sidebar size={18} className="text-purple-500"/> 核心配置
                                </div>
                                {renderCodeBlock('manifest.json', getManifestJson())}
                                {renderCodeBlock('background.js', extBackgroundJs)}
                                
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <MousePointerClick size={18} className="text-blue-500"/> 快速添加弹窗 (Popup)
                                </div>
                                {renderCodeBlock('popup.html', extPopupHtml)}
                                {renderCodeBlock('popup.js', extPopupJs)}
                                
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <Keyboard size={18} className="text-green-500"/> 侧边栏导航功能 (Sidebar)
                                </div>
                                {renderCodeBlock('sidebar.html', extSidebarHtml)}
                                {renderCodeBlock('sidebar.js', extSidebarJs)}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end bg-slate-50 dark:bg-slate-800/50 shrink-0">
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Save size={18} /> 保存更改
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
