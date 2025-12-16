
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Bot, Key, Globe, Sparkles, PauseCircle, Wrench, Box, Copy, Check, List, GripVertical, Filter, LayoutTemplate, RefreshCw, Info, Download, Sidebar, Keyboard } from 'lucide-react';
import { AIConfig, LinkItem, Category, SiteSettings } from '../types';
import { generateLinkDescription } from '../services/geminiService';

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
    
    // 生成渐变 ID，防止多个 SVG 在同一页面导致 ID 冲突虽然这里是 base64 但是个好习惯
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
  
  // Link Management State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  const availableCategories = useMemo(() => {
      const catIds = Array.from(new Set(links.map(l => l.categoryId)));
      return catIds;
  }, [links]);

  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});

  // 生成一组随机图标
  const updateGeneratedIcons = (text: string) => {
      const newIcons: string[] = [];
      // 生成 6 个不同的随机样式
      for (let i = 0; i < 6; i++) {
          const c1 = getRandomColor();
          // 第二个颜色在色相上偏移 30-60 度，形成邻近色渐变
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
      // 只有当生成的图标为空时，才自动生成，避免覆盖
      if (generatedIcons.length === 0) {
          updateGeneratedIcons(safeSettings.navTitle);
      }

      setIsProcessing(false);
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

  // --- Drag and Drop Logic ---

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

  // Extension Generators - Dynamic based on settings
  const getManifestJson = () => {
    const json: any = {
        manifest_version: 3,
        name: localSiteSettings.navTitle || "CloudNav Assistant",
        version: "1.3",
        // Added 'storage' for cache, 'favicon' for reliable icons
        permissions: ["activeTab", "scripting", "sidePanel", "storage", "favicon"], 
        action: {
            default_popup: "popup.html",
            default_title: `Save to ${localSiteSettings.navTitle || 'CloudNav'}`
        },
        side_panel: {
            default_path: "sidebar.html"
        },
        icons: {
            "128": "icon.png"
        },
        commands: {
          "_execute_side_panel": {
            "suggested_key": {
              "default": "Ctrl+Shift+E",
              "mac": "Command+Shift+E"
            },
            "description": "Open Side Panel"
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

  const extPopupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 300px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; background: #f8fafc; color: #1e293b; }
    h3 { margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #0f172a; }
    button { width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px; transition: background 0.2s; }
    button:hover { background: #2563eb; }
    button:disabled { background: #94a3b8; cursor: not-allowed; }
    
    .status { margin-top: 12px; font-size: 13px; text-align: center; color: #64748b; min-height: 20px; font-weight: 500; }
    
    .input-group { margin-bottom: 16px; background: #ffffff; padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .input-group:focus-within { border-color: #3b82f6; ring: 2px solid #3b82f6; }
    
    #page-icon { width: 16px; height: 16px; margin-right: 8px; border-radius: 2px; flex-shrink: 0; }
    
    .page-input { border: none; outline: none; width: 100%; font-size: 13px; color: #1e293b; background: transparent; font-family: inherit; }
    .page-input::placeholder { color: #94a3b8; }
    
    select { width: 100%; padding: 8px 12px; margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #334155; font-size: 14px; outline: none; appearance: none; background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); background-position: right 0.5rem center; background-repeat: no-repeat; background-size: 1.5em 1.5em; }
    select:focus { border-color: #3b82f6; ring: 2px solid #3b82f6; }
  </style>
</head>
<body>
  <h3>${localSiteSettings.navTitle || 'CloudNav'}</h3>
  
  <div class="input-group">
      <img id="page-icon" style="display:none;" />
      <input type="text" id="page-title" class="page-input" placeholder="Loading..." />
  </div>
  
  <select id="category-select">
     <option value="">加载分类中...</option>
  </select>
  
  <button id="save-btn" disabled>正在初始化...</button>
  
  <div id="status" class="status"></div>
  
  <script src="popup.js"></script>
</body>
</html>`;

  const extPopupJs = `const CONFIG = {
  apiBase: "${domain}",
  password: "${password}",
  navTitle: "${localSiteSettings.navTitle || 'CloudNav'}"
};

const CACHE_KEY = 'cloudnav_data';

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const saveBtn = document.getElementById('save-btn');
  const catSelect = document.getElementById('category-select');
  const titleInput = document.getElementById('page-title');
  const iconImg = document.getElementById('page-icon');

  // Helper to render categories and check duplicates
  const renderUI = (data, currentTab) => {
      const categories = data.categories || [];
      const links = data.links || [];

      // Populate Dropdown
      catSelect.innerHTML = '';
      if (categories.length === 0) {
           const opt = document.createElement('option');
           opt.value = 'common';
           opt.textContent = '默认分类';
           catSelect.appendChild(opt);
      } else {
           categories.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c.id;
              opt.textContent = c.name;
              catSelect.appendChild(opt);
           });
      }
      
      if (categories.some(c => c.id === 'common')) catSelect.value = 'common';

      // Check Duplicates
      const normalize = u => u ? u.toLowerCase().trim().replace(/\\/$/, '') : '';
      const currentUrl = normalize(currentTab.url);
      const existing = links.find(l => normalize(l.url) === currentUrl);

      if (existing) {
          const existCat = categories.find(c => c.id === existing.categoryId);
          const catName = existCat ? existCat.name : '未知分类';
          statusEl.innerHTML = \`<span style="color:#d97706">⚠️ 链接已存在于 [ \${catName} ]</span>\`;
          saveBtn.textContent = "更新链接 (再次保存)";
          saveBtn.style.backgroundColor = "#eab308";
          if (existing.categoryId) catSelect.value = existing.categoryId;
      } else {
          saveBtn.textContent = "保存到 " + CONFIG.navTitle;
          saveBtn.style.backgroundColor = "#3b82f6";
      }
      saveBtn.disabled = false;
  };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 1. Render Page Info
    titleInput.value = tab.title;
    if (tab.favIconUrl) {
       // Prefer chrome native favicon API if available in popup
       // But popup usually relies on tabs API for current tab info
       iconImg.src = tab.favIconUrl;
       iconImg.style.display = 'block';
    }

    // 2. Load Data (Cache First Strategy)
    try {
        // Step A: Check Local Storage
        const cached = await chrome.storage.local.get(CACHE_KEY);
        if (cached[CACHE_KEY]) {
            console.log("Loaded from cache");
            renderUI(cached[CACHE_KEY], tab);
            // Optional: Background refresh could go here if needed, but we'll stick to cache for speed
        } else {
            // Step B: Fetch from Network if no cache
            saveBtn.textContent = "正在连接...";
            const res = await fetch(\`\${CONFIG.apiBase}/api/storage\`, {
                method: 'GET',
                headers: { 'x-auth-password': CONFIG.password }
            });
            if (!res.ok) throw new Error('Connect Error');
            const data = await res.json();
            
            // Save to cache
            await chrome.storage.local.set({ [CACHE_KEY]: data });
            renderUI(data, tab);
        }

    } catch (e) {
        console.error(e);
        // Fallback UI
        catSelect.innerHTML = '<option value="common">默认分类 (离线)</option>';
        saveBtn.textContent = "尝试保存";
        saveBtn.disabled = false;
        statusEl.textContent = "无法加载数据，将使用默认分类";
    }

    // 3. Save Handler
    saveBtn.addEventListener('click', async () => {
      const originalText = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      statusEl.textContent = '';
      
      try {
        const res = await fetch(\`\${CONFIG.apiBase}/api/link\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-password': CONFIG.password
          },
          body: JSON.stringify({
            title: titleInput.value,
            url: tab.url,
            icon: tab.favIconUrl || '',
            categoryId: catSelect.value
          })
        });

        if (res.ok) {
          const responseData = await res.json();
          statusEl.textContent = '✅ 已保存!';
          statusEl.style.color = '#16a34a';
          saveBtn.textContent = '保存成功';

          // Update Local Cache manually to reflect the new link immediately
          const cached = await chrome.storage.local.get(CACHE_KEY);
          if (cached[CACHE_KEY]) {
              const newData = cached[CACHE_KEY];
              // Add new link to top
              if (responseData.link) {
                  // Remove if exists (update)
                  newData.links = newData.links.filter(l => l.url !== responseData.link.url);
                  newData.links.unshift(responseData.link);
                  await chrome.storage.local.set({ [CACHE_KEY]: newData });
              }
          } else {
              // If no cache, force fetch next time
          }

          setTimeout(() => window.close(), 1000);
        } else {
          throw new Error(res.status);
        }
      } catch (e) {
        statusEl.textContent = '同步失败';
        statusEl.style.color = '#dc2626';
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });
  } catch(e) {
     statusEl.textContent = "Ext Error: " + e.message;
  }
});`;

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
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding-bottom: 20px; }
        
        /* Search Bar */
        .header { position: sticky; top: 0; padding: 10px 12px; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 10; display: flex; gap: 8px; }
        .search-input { flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--hover); color: var(--text); outline: none; box-sizing: border-box; font-size: 13px; }
        .search-input:focus { border-color: var(--accent); }
        
        .refresh-btn { width: 30px; display: flex; items-center; justify-content: center; border: 1px solid var(--border); background: var(--hover); border-radius: 6px; color: var(--muted); cursor: pointer; transition: all 0.2s; }
        .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
        .refresh-btn:active { transform: scale(0.95); }
        .rotating { animation: spin 1s linear infinite; }
        
        @keyframes spin { 100% { transform: rotate(360deg); } }

        /* Accordion Content */
        .content { padding: 4px; }
        
        .cat-group { margin-bottom: 2px; }
        
        .cat-header { 
            padding: 8px 10px; 
            font-size: 13px; 
            font-weight: 600; 
            color: var(--text); 
            cursor: pointer; 
            display: flex; 
            items-center; 
            gap: 8px; 
            border-radius: 6px;
            user-select: none;
            transition: background 0.1s;
        }
        .cat-header:hover { background: var(--hover); }
        
        .cat-arrow { width: 14px; height: 14px; color: var(--muted); transition: transform 0.2s; }
        .cat-header.active .cat-arrow { transform: rotate(90deg); color: var(--accent); }
        
        .cat-links { display: none; padding-left: 8px; margin-bottom: 8px; }
        .cat-header.active + .cat-links { display: block; }
        
        /* Links */
        .link-item { display: flex; items-center; gap: 8px; padding: 6px 8px; border-radius: 6px; text-decoration: none; color: var(--text); transition: background 0.1s; border-left: 2px solid transparent; }
        .link-item:hover { background: var(--hover); border-left-color: var(--accent); }
        
        .link-icon { width: 16px; height: 16px; flex-shrink: 0; display: flex; items-center; justify-content: center; overflow: hidden; }
        .link-icon img { width: 100%; height: 100%; object-fit: contain; }
        
        .link-info { min-width: 0; flex: 1; }
        .link-title { font-size: 13px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
        
        /* Empty States */
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

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('content');
    const searchInput = document.getElementById('search');
    const refreshBtn = document.getElementById('refresh');
    
    let allLinks = [];
    let allCategories = [];
    // Store expanded categories
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

    // Attach global click listener for dynamic elements
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
        
        // If searching, auto-expand all relevant categories
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

            // Accordion Logic: Expand if user opened it previously OR if searching
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
                // Use Chrome Native Favicon API
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

  // Download Helper for Icon
  const handleDownloadIcon = async () => {
     const iconUrl = localSiteSettings.favicon;
     if (!iconUrl) return;

     try {
         // Create an image to render the data (handles both URL and Base64)
         const img = new Image();
         img.crossOrigin = "anonymous"; // Try to handle CORS if it's a URL
         img.src = iconUrl;

         await new Promise((resolve, reject) => {
             img.onload = resolve;
             img.onerror = reject;
         });

         // Create canvas to convert to PNG
         const canvas = document.createElement('canvas');
         canvas.width = 128;
         canvas.height = 128;
         const ctx = canvas.getContext('2d');
         if (!ctx) throw new Error('Canvas error');

         // Draw image
         ctx.drawImage(img, 0, 0, 128, 128);

         // Convert to Blob
         canvas.toBlob((blob) => {
             if (!blob) {
                 alert("生成图片失败");
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
         }, 'image/png');

     } catch (e) {
         console.error(e);
         // Fallback for CORS issues where Canvas becomes tainted or load fails
         alert("自动转换 PNG 失败 (可能是跨域限制)。\n\n请尝试右键点击下方的预览图片，选择 '图片另存为...' 保存。");
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
                            
                            {/* Card Style Setting Removed as requested */}

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
                                    <li>在电脑上新建文件夹 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">CloudNav-Ext</code>。</li>
                                    <li><strong>[重要]</strong> 将下方图标保存为 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">icon.png</code>。</li>
                                    <li>在文件夹中创建以下 5 个文件。 <span className="text-red-500 dark:text-red-400 font-bold">注意：必须下载所有文件，特别是 sidebar.html，否则会报错。</span></li>
                                    <li>
                                        打开浏览器扩展管理页面 
                                        {browserType === 'chrome' ? (
                                            <> (Chrome: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">chrome://extensions</code>)</>
                                        ) : (
                                            <> (Firefox: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">about:debugging</code>)</>
                                        )}。
                                    </li>
                                    {browserType === 'chrome' && <li>开启 "<strong>开发者模式</strong>"。</li>}
                                    <li>点击 "<strong>加载已解压的扩展程序</strong>"，选择该文件夹。</li>
                                    <li><strong className="text-blue-600 dark:text-blue-400">新功能:</strong> 按下 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">Ctrl+Shift+E</code> 即可呼出侧边栏导航！</li>
                                </ol>
                                <div className="mt-3 text-xs p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-900/50 space-y-2">
                                    <div><strong>常见错误:</strong> 如果提示 <em>"Side panel file path must exist"</em>，说明您忘记创建或错误命名了 <code>sidebar.html</code> 文件。请确保文件夹内包含所有5个代码文件。</div>
                                    <div className="text-amber-800 dark:text-amber-300"><strong>快捷键无效?</strong> 如果按 <code className="font-mono">Ctrl+Shift+E</code> 没反应，请前往 <a href="chrome://extensions/shortcuts" className="underline" target="_blank">chrome://extensions/shortcuts</a> 手动绑定。</div>
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
                                
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <Save size={18} className="text-blue-500"/> 弹窗保存功能 (Popup)
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
