
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, Upload, Moon, Sun, Menu, 
  Trash2, Edit2, Loader2, Cloud, CheckCircle2, AlertCircle,
  Pin, Settings, Lock, CloudCog, Github, GitFork, MoreVertical,
  QrCode, Copy, LayoutGrid, List, Check, ExternalLink
} from 'lucide-react';
import { 
    LinkItem, Category, DEFAULT_CATEGORIES, INITIAL_LINKS, 
    WebDavConfig, AIConfig, SiteSettings, SearchEngine, DEFAULT_SEARCH_ENGINES 
} from './types';
import Icon from './components/Icon';
import LinkModal from './components/LinkModal';
import AuthModal from './components/AuthModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import BackupModal from './components/BackupModal';
import CategoryAuthModal from './components/CategoryAuthModal';
import ImportModal from './components/ImportModal';
import SettingsModal from './components/SettingsModal';

const GITHUB_REPO_URL = 'https://github.com/sese972010/CloudNav-';

const LOCAL_STORAGE_KEY = 'cloudnav_data_cache';
const AUTH_KEY = 'cloudnav_auth_token';
const WEBDAV_CONFIG_KEY = 'cloudnav_webdav_config';
const AI_CONFIG_KEY = 'cloudnav_ai_config';

function App() {
  // --- State ---
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngine, setSearchEngine] = useState<SearchEngine>(DEFAULT_SEARCH_ENGINES[0]);
  const [showEngineDropdown, setShowEngineDropdown] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({
      title: 'CloudNav - 我的导航',
      navTitle: '云航 CloudNav',
      favicon: '/favicon.ico',
      cardStyle: 'detailed'
  });
  
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, link: LinkItem | null } | null>(null);
  
  const [qrCodeLink, setQrCodeLink] = useState<LinkItem | null>(null);

  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState<Set<string>>(new Set());

  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
      url: '',
      username: '',
      password: '',
      enabled: false
  });

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {}
      }
      return {
          provider: 'gemini',
          apiKey: process.env.API_KEY || '', 
          baseUrl: '',
          model: 'gemini-2.5-flash'
      };
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [catAuthModalData, setCatAuthModalData] = useState<Category | null>(null);
  
  const [editingLink, setEditingLink] = useState<LinkItem | undefined>(undefined);
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>(undefined);
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authToken, setAuthToken] = useState<string>('');

  const mainRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // --- Helpers ---

  const loadFromLocal = () => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLinks(parsed.links || INITIAL_LINKS);
        setCategories(parsed.categories || DEFAULT_CATEGORIES);
        if (parsed.settings) setSiteSettings(parsed.settings);
      } catch (e) {
        setLinks(INITIAL_LINKS);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setLinks(INITIAL_LINKS);
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const syncToCloud = async (newLinks: LinkItem[], newCategories: Category[], newSettings: SiteSettings, token: string) => {
    setSyncStatus('saving');
    try {
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': token
            },
            body: JSON.stringify({ links: newLinks, categories: newCategories, settings: newSettings })
        });

        if (response.status === 401) {
            setAuthToken('');
            localStorage.removeItem(AUTH_KEY);
            setIsAuthOpen(true);
            setSyncStatus('error');
            return false;
        }

        if (!response.ok) throw new Error('Network response was not ok');
        
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
        return true;
    } catch (error) {
        console.error("Sync failed", error);
        setSyncStatus('error');
        return false;
    }
  };

  const updateData = (newLinks: LinkItem[], newCategories: Category[], newSettings: SiteSettings = siteSettings) => {
      setLinks(newLinks);
      setCategories(newCategories);
      setSiteSettings(newSettings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: newLinks, categories: newCategories, settings: newSettings }));
      if (authToken) {
          syncToCloud(newLinks, newCategories, newSettings, authToken);
      }
  };

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    const savedToken = localStorage.getItem(AUTH_KEY);
    if (savedToken) setAuthToken(savedToken);

    const savedWebDav = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (savedWebDav) {
        try {
            setWebDavConfig(JSON.parse(savedWebDav));
        } catch (e) {}
    }

    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (addUrl) {
        const addTitle = urlParams.get('add_title') || '';
        window.history.replaceState({}, '', window.location.pathname);
        setPrefillLink({
            title: addTitle,
            url: addUrl,
            categoryId: 'common'
        });
        setEditingLink(undefined);
        setIsModalOpen(true);
    }

    const initData = async () => {
        try {
            const res = await fetch('/api/storage');
            if (res.ok) {
                const data = await res.json();
                if (data.links && data.links.length > 0) {
                    setLinks(data.links);
                    setCategories(data.categories || DEFAULT_CATEGORIES);
                    if (data.settings) setSiteSettings(data.settings);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                    return;
                }
            } 
        } catch (e) {
            console.warn("Failed to fetch from cloud, falling back to local.", e);
        }
        loadFromLocal();
    };

    initData();
  }, []);

  useEffect(() => {
      document.title = siteSettings.title || 'CloudNav';
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link && siteSettings.favicon) {
          link.href = siteSettings.favicon;
      }
  }, [siteSettings]);

  useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
          if (openMenuId) setOpenMenuId(null);
          if (showEngineDropdown) setShowEngineDropdown(false);
          // Context menu close logic is handled by specific click or global click
          if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
             setContextMenu(null);
          }
      };
      
      const handleScroll = () => {
         if (contextMenu) setContextMenu(null);
      };

      window.addEventListener('click', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true); 
      
      // Prevent default context menu if ours is open, but only on the menu itself
      const handleGlobalContextMenu = (e: MouseEvent) => {
          if (contextMenu) {
              e.preventDefault();
              setContextMenu(null);
          }
      }
      window.addEventListener('contextmenu', handleGlobalContextMenu);

      return () => {
          window.removeEventListener('click', handleClickOutside);
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('contextmenu', handleGlobalContextMenu);
      }
  }, [openMenuId, showEngineDropdown, contextMenu]);

  useEffect(() => {
    const handleScroll = () => {
        if (isAutoScrollingRef.current) return;
        if (!mainRef.current) return;
        
        const scrollPosition = mainRef.current.scrollTop + 150;

        if (mainRef.current.scrollTop < 80) {
            setActiveCategory('all');
            return;
        }

        let currentCatId = 'all';
        for (const cat of categories) {
            const el = document.getElementById(`cat-${cat.id}`);
            if (el && el.offsetTop <= scrollPosition && (el.offsetTop + el.offsetHeight) > scrollPosition) {
                currentCatId = cat.id;
                break;
            }
        }
        if (currentCatId !== 'all') setActiveCategory(currentCatId);
    };

    const mainEl = mainRef.current;
    if (mainEl) mainEl.addEventListener('scroll', handleScroll);
    return () => mainEl?.removeEventListener('scroll', handleScroll);
  }, [categories]);

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // --- Handlers ---
  const handleLogin = async (password: string): Promise<boolean> => {
      try {
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': password
            },
            body: JSON.stringify({ links, categories, settings: siteSettings })
        });
        
        if (response.ok) {
            setAuthToken(password);
            localStorage.setItem(AUTH_KEY, password);
            setIsAuthOpen(false);
            setSyncStatus('saved');
            return true;
        }
        return false;
      } catch (e) {
          return false;
      }
  };

  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
      const mergedCategories = [...categories];
      newCategories.forEach(nc => {
          if (!mergedCategories.some(c => c.id === nc.id || c.name === nc.name)) {
              mergedCategories.push(nc);
          }
      });
      const mergedLinks = [...links, ...newLinks];
      updateData(mergedLinks, mergedCategories);
      setIsImportModalOpen(false);
      alert(`成功导入 ${newLinks.length} 个新书签!`);
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    const newLink: LinkItem = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now()
    };
    updateData([newLink, ...links], categories);
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (!editingLink) return;
    const updated = links.map(l => l.id === editingLink.id ? { ...l, ...data } : l);
    updateData(updated, categories);
    setEditingLink(undefined);
  };

  const handleDeleteLink = (id: string) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (confirm('确定删除此链接吗?')) {
      updateData(links.filter(l => l.id !== id), categories);
    }
  };

  const togglePin = (id: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const updated = links.map(l => l.id === id ? { ...l, pinned: !l.pinned } : l);
      updateData(updated, categories);
  };
  
  const handleCopyLink = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  const handleSaveAIConfig = (config: AIConfig, newSiteSettings: SiteSettings) => {
      setAiConfig(config);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
      if (authToken) {
          updateData(links, categories, newSiteSettings);
      } else {
          setSiteSettings(newSiteSettings);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links, categories, settings: newSiteSettings }));
      }
  };

  const scrollToCategory = (catId: string) => {
      setActiveCategory(catId);
      setSidebarOpen(false);
      
      if (catId === 'all') {
          isAutoScrollingRef.current = true;
          mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => isAutoScrollingRef.current = false, 800);
          return;
      }
      const el = document.getElementById(`cat-${catId}`);
      if (el) {
          isAutoScrollingRef.current = true;
          const top = el.offsetTop - 80;
          mainRef.current?.scrollTo({ top, behavior: 'smooth' });
          setTimeout(() => isAutoScrollingRef.current = false, 800);
      }
  };

  const handleUnlockCategory = (catId: string) => {
      setUnlockedCategoryIds(prev => new Set(prev).add(catId));
  };

  const handleUpdateCategories = (newCats: Category[], newLinks?: LinkItem[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(newLinks || links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const newCats = categories.filter(c => c.id !== catId);
      const targetId = 'common'; 
      const newLinks = links.map(l => l.categoryId === catId ? { ...l, categoryId: targetId } : l);
      if (newCats.length === 0) newCats.push(DEFAULT_CATEGORIES[0]);
      updateData(newLinks, newCats);
  };

  const handleSaveWebDavConfig = (config: WebDavConfig) => {
      setWebDavConfig(config);
      localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(config));
  };

  const handleRestoreBackup = (restoredLinks: LinkItem[], restoredCategories: Category[]) => {
      updateData(restoredLinks, restoredCategories);
      setIsBackupModalOpen(false);
  };
  
  const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      
      if (searchEngine.id !== 'local') {
          window.open(searchEngine.url + encodeURIComponent(searchQuery), '_blank');
          setSearchQuery('');
      }
  };

  const isCategoryLocked = (catId: string) => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || !cat.password) return false;
      return !unlockedCategoryIds.has(catId);
  };

  const pinnedLinks = useMemo(() => {
      return links.filter(l => l.pinned && !isCategoryLocked(l.categoryId));
  }, [links, categories, unlockedCategoryIds]);

  const searchResults = useMemo(() => {
    // IMPORTANT: If engine is NOT local, we do NOT filter links.
    // We only filter if engine is 'local'.
    if (searchEngine.id !== 'local') return links;

    let result = links;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.title.toLowerCase().includes(q) || 
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
      );
    }
    return result;
  }, [links, searchQuery, searchEngine]);

  // --- Render Components ---

  const renderLinkCard = (link: LinkItem) => {
      const iconDisplay = link.icon ? (
         <img 
            src={link.icon} 
            alt="" 
            className="w-5 h-5 object-contain" 
            onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerText = link.title.charAt(0);
            }}
         />
      ) : link.title.charAt(0);
      
      const isSimple = siteSettings.cardStyle === 'simple';

      return (
        <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                let x = e.clientX;
                let y = e.clientY;
                // Boundary adjustment
                if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
                if (y + 200 > window.innerHeight) y = window.innerHeight - 210;
                setContextMenu({ x, y, link });
                return false;
            }}
            className={`group relative flex flex-col ${isSimple ? 'p-2' : 'p-3'} bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:border-blue-200 dark:hover:border-slate-600 hover:-translate-y-0.5 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-slate-750`}
            title={link.description || link.url}
        >
            <div className={`flex items-center gap-3 ${isSimple ? '' : 'mb-1.5'} pr-6`}>
                <div className={`${isSimple ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-lg bg-slate-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold uppercase shrink-0 overflow-hidden`}>
                    {iconDisplay}
                </div>
                <h3 className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {link.title}
                </h3>
            </div>
            {!isSimple && (
                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 h-4 w-full overflow-hidden">
                    {link.description || <span className="opacity-0">.</span>}
                </div>
            )}
        </a>
      );
  };

  return (
    <div className="flex h-screen overflow-hidden text-slate-900 dark:text-slate-50">
      
      {/* Right Click Context Menu */}
      {contextMenu && (
          <div 
             ref={contextMenuRef}
             className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-600 w-44 py-2 flex flex-col animate-in fade-in zoom-in duration-100 overflow-hidden"
             style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={(e) => e.stopPropagation()}
             onContextMenu={(e) => e.preventDefault()}
          >
             <button onClick={() => { handleCopyLink(contextMenu.link!.url); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <Copy size={16} className="text-slate-400"/> <span>复制链接</span>
             </button>
             <button onClick={() => { setQrCodeLink(contextMenu.link); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <QrCode size={16} className="text-slate-400"/> <span>显示二维码</span>
             </button>
             <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"/>
             <button onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(contextMenu.link!); setIsModalOpen(true); setContextMenu(null); }}} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <Edit2 size={16} className="text-slate-400"/> <span>编辑链接</span>
             </button>
             <button onClick={() => { togglePin(contextMenu.link!.id); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <Pin size={16} className={contextMenu.link!.pinned ? "fill-current text-blue-500" : "text-slate-400"}/> <span>{contextMenu.link!.pinned ? '取消置顶' : '置顶'}</span>
             </button>
             <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"/>
             <button onClick={() => { handleDeleteLink(contextMenu.link!.id); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors text-left">
                 <Trash2 size={16}/> <span>删除链接</span>
             </button>
          </div>
      )}

      {/* QR Code Modal */}
      {qrCodeLink && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setQrCodeLink(null)}>
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                  <h3 className="font-bold text-lg text-slate-800">{qrCodeLink.title}</h3>
                  <div className="p-2 border border-slate-200 rounded-lg">
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCodeLink.url)}`} 
                        alt="QR Code" 
                        className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-slate-500 max-w-[200px] truncate">{qrCodeLink.url}</p>
              </div>
          </div>
      )}

      <AuthModal isOpen={isAuthOpen} onLogin={handleLogin} />
      
      <CategoryAuthModal 
        isOpen={!!catAuthModalData}
        category={catAuthModalData}
        onClose={() => setCatAuthModalData(null)}
        onUnlock={handleUnlockCategory}
      />

      <CategoryManagerModal 
        isOpen={isCatManagerOpen} 
        onClose={() => setIsCatManagerOpen(false)}
        categories={categories}
        links={links}
        onUpdateCategories={handleUpdateCategories}
        onDeleteCategory={handleDeleteCategory}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        links={links}
        categories={categories}
        onRestore={handleRestoreBackup}
        webDavConfig={webDavConfig}
        onSaveWebDavConfig={handleSaveWebDavConfig}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingLinks={links}
        categories={categories}
        onImport={handleImportConfirm}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={aiConfig}
        siteSettings={siteSettings}
        onSave={handleSaveAIConfig}
        links={links}
        categories={categories}
        onUpdateLinks={(newLinks) => updateData(newLinks, categories)}
      />

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out
          bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700 shrink-0 gap-3">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30 overflow-hidden">
                 {siteSettings.favicon ? (
                    <img src={siteSettings.favicon} alt="" className="w-full h-full object-cover" />
                 ) : (
                    "C"
                 )}
             </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent truncate">
              {siteSettings.navTitle || 'CloudNav'}
            </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
            <button
              onClick={() => scrollToCategory('all')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeCategory === 'all' 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="p-1"><Icon name="LayoutGrid" size={18} /></div>
              <span>全部链接</span>
            </button>
            
            <div className="flex items-center justify-between pt-4 pb-2 px-4">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">分类目录</span>
               <button 
                  onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsCatManagerOpen(true); }}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  title="管理分类"
               >
                  <Settings size={14} />
               </button>
            </div>

            {categories.map(cat => {
                const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                const isEmoji = cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon);
                
                return (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group ${
                      activeCategory === cat.id 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${activeCategory === cat.id ? 'bg-blue-100 dark:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      {isLocked ? <Lock size={16} className="text-amber-500" /> : (isEmoji ? <span className="text-base leading-none">{cat.icon}</span> : <Icon name={cat.icon} size={16} />)}
                    </div>
                    <span className="truncate flex-1 text-left">{cat.name}</span>
                    {activeCategory === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                  </button>
                );
            })}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <div className="grid grid-cols-3 gap-2 mb-2">
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsImportModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="导入书签"
                >
                    <Upload size={14} />
                    <span>导入</span>
                </button>
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsBackupModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="备份与恢复"
                >
                    <CloudCog size={14} />
                    <span>备份</span>
                </button>
                <button 
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="AI 设置"
                >
                    <Settings size={14} />
                    <span>设置</span>
                </button>
            </div>
            
            <div className="flex items-center justify-between text-xs px-2 mt-2">
               <div className="flex items-center gap-1 text-slate-400">
                 {syncStatus === 'saving' && <Loader2 className="animate-spin w-3 h-3 text-blue-500" />}
                 {syncStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                 {syncStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                 {authToken ? <span className="text-green-600">已同步</span> : <span className="text-amber-500">离线</span>}
               </div>
               <a 
                 href={GITHUB_REPO_URL} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                 title="Fork this project on GitHub"
               >
                 <GitFork size={14} />
                 <span>Fork 项目</span>
               </a>
            </div>
        </div>
      </aside>

      <main 
          ref={mainRef}
          className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto relative scroll-smooth"
      >
        <header className="h-16 px-4 lg:px-8 flex items-center justify-between bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300">
              <Menu size={24} />
            </button>

            {/* Enhanced Search Bar */}
            <div className="relative w-full max-w-lg hidden sm:block group z-50">
                <form onSubmit={handleSearchSubmit} className="relative flex items-center w-full rounded-full bg-slate-100 dark:bg-slate-700/50 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white dark:focus-within:bg-slate-700">
                    {/* Engine Selector */}
                    <div className="relative">
                        <button 
                            type="button"
                            onClick={() => setShowEngineDropdown(!showEngineDropdown)}
                            className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border-r border-slate-200 dark:border-slate-600 h-10 rounded-l-full"
                        >
                            {searchEngine.id === 'local' ? (
                                <Search size={16} />
                            ) : (
                                <img src={searchEngine.icon} alt="" className="w-4 h-4 rounded-full"/>
                            )}
                            <span className="hidden md:inline">{searchEngine.name}</span>
                        </button>
                        
                        {/* Dropdown */}
                        {showEngineDropdown && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-600 py-2 animate-in fade-in zoom-in duration-200 overflow-hidden">
                                {DEFAULT_SEARCH_ENGINES.map(engine => (
                                    <button
                                        key={engine.id}
                                        type="button"
                                        onClick={() => { setSearchEngine(engine); setShowEngineDropdown(false); setSearchQuery(''); searchInputRef.current?.focus(); }}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                            searchEngine.id === engine.id 
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {engine.id === 'local' ? <Search size={16} /> : <img src={engine.icon} className="w-4 h-4 rounded-full"/>}
                                        {engine.name}
                                        {searchEngine.id === engine.id && <Check size={14} className="ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder={searchEngine.id === 'local' ? "搜索书签..." : `在 ${searchEngine.name} 搜索...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-3 pr-4 py-2 bg-transparent border-none text-sm dark:text-white placeholder-slate-400 outline-none"
                    />
                    
                    {/* Visual Indicator for External Search */}
                    {searchEngine.id !== 'local' && searchQuery && (
                        <button type="submit" className="absolute right-2 p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-full hover:bg-blue-200 transition-colors">
                            <ArrowRight size={14} className="lucide-arrow-right" />
                        </button>
                    )}
                </form>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 mr-2">
                <button 
                    onClick={() => authToken && updateData(links, categories, { ...siteSettings, cardStyle: 'simple' })}
                    title="简约模式"
                    className={`p-1.5 rounded transition-all ${siteSettings.cardStyle === 'simple' ? 'bg-white dark:bg-slate-600 shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <LayoutGrid size={16} />
                </button>
                <button 
                    onClick={() => authToken && updateData(links, categories, { ...siteSettings, cardStyle: 'detailed' })}
                    title="详情模式"
                    className={`p-1.5 rounded transition-all ${siteSettings.cardStyle === 'detailed' ? 'bg-white dark:bg-slate-600 shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <List size={16} />
                </button>
            </div>

            <button onClick={toggleTheme} className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {!authToken && (
                <button onClick={() => setIsAuthOpen(true)} className="hidden sm:flex items-center gap-2 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-medium">
                    <Cloud size={14} /> 登录
                </button>
            )}

            <button
              onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(undefined); setIsModalOpen(true); }}}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-full text-sm font-medium shadow-lg shadow-blue-500/30"
            >
              <Plus size={16} /> <span className="hidden sm:inline">添加</span>
            </button>
          </div>
        </header>

        <div className="p-4 lg:p-8 space-y-8">
            
            {pinnedLinks.length > 0 && !searchQuery && (
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <Pin size={16} className="text-blue-500 fill-blue-500" />
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            置顶 / 常用
                        </h2>
                    </div>
                    <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                        {pinnedLinks.map(link => renderLinkCard(link))}
                    </div>
                </section>
            )}

            {categories.map(cat => {
                let catLinks = searchResults.filter(l => l.categoryId === cat.id);
                const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                
                // Logic Fix: If External Search, do NOT hide categories based on links
                // Because external search doesn't filter links.
                // However, the user probably wants to see the links grid even when typing for external search
                // Current logic: if search query exists AND local search -> filter. 
                // If search query exists AND external search -> show all (searchResults returns all).
                
                if (searchQuery && searchEngine.id === 'local' && catLinks.length === 0) return null;

                return (
                    <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-24">
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                             <div className="text-slate-400">
                                {cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon) ? <span className="text-lg">{cat.icon}</span> : <Icon name={cat.icon} size={20} />}
                             </div>
                             <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                 {cat.name}
                             </h2>
                             {isLocked && <Lock size={16} className="text-amber-500" />}
                        </div>
                        
                        {isLocked ? (
                             <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400">
                                    <Lock size={24} />
                                </div>
                                <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">私密目录</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">该分类已加密，需要验证密码才能查看内容</p>
                                <button 
                                    onClick={() => setCatAuthModalData(cat)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    输入密码解锁
                                </button>
                             </div>
                        ) : (
                             <>
                                {catLinks.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-sm italic">
                                        暂无链接
                                    </div>
                                ) : (
                                    <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                                        {catLinks.map(link => renderLinkCard(link))}
                                    </div>
                                )}
                             </>
                        )}
                    </section>
                );
            })}
            
            {/* Empty State for Local Search */}
            {searchQuery && searchEngine.id === 'local' && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Search size={40} className="opacity-30 mb-4" />
                    <p>没有找到相关内容</p>
                    <button onClick={() => setIsModalOpen(true)} className="mt-4 text-blue-500 hover:underline">添加一个?</button>
                </div>
            )}

            <div className="h-20"></div>
        </div>
      </main>

      <LinkModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingLink(undefined); setPrefillLink(undefined); }}
        onSave={editingLink ? handleEditLink : handleAddLink}
        categories={categories}
        existingLinks={links}
        initialData={editingLink || (prefillLink as LinkItem)}
        aiConfig={aiConfig}
      />
    </div>
  );
}

// Add simple arrow right icon for search button
const ArrowRight = ({ size, className }: { size: number, className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
    </svg>
);

export default App;
