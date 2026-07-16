import React, { useState, useEffect } from 'react';
import { X, Cloud, Download, Upload, CheckCircle2, AlertCircle, RefreshCw, Save } from 'lucide-react';
import { Category, LinkItem, WebDavConfig } from '../types';
import { checkWebDavConnection, uploadBackup, downloadBackup } from '../services/webDavService';
import type { WebDavResult } from '../services/webDavService';
import { generateBookmarkHtml, downloadHtmlFile } from '../services/exportService';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  links: LinkItem[];
  categories: Category[];
  onRestore: (links: LinkItem[], categories: Category[]) => void;
  webDavConfig: WebDavConfig;
  onSaveWebDavConfig: (config: WebDavConfig) => void;
}

const BackupModal: React.FC<BackupModalProps> = ({ 
  isOpen, onClose, links, categories, onRestore, webDavConfig, onSaveWebDavConfig 
}) => {
  const [config, setConfig] = useState<WebDavConfig>(webDavConfig);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [testError, setTestError] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'downloading' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if(isOpen) {
        setConfig(webDavConfig);
        setTestResult(null);
        setTestError('');
        setSyncStatus('idle');
        setStatusMsg('');
    }
  }, [isOpen, webDavConfig]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError('');
    const result = await checkWebDavConnection(config);
    setTestResult(result.success ? 'success' : 'fail');
    if (!result.success && result.error) {
        setTestError(result.error);
    }
    setIsTesting(false);
  };

  const handleSaveConfig = () => {
    onSaveWebDavConfig(config);
    // Automatically test upon save if enabled
    if (config.enabled) {
        handleTestConnection();
    }
  };

  const handleBackupToCloud = async () => {
    setSyncStatus('uploading');
    setStatusMsg('正在上传...');
    const result = await uploadBackup(config, { links, categories });
    if (result.success) {
        setSyncStatus('success');
        setStatusMsg('备份成功！');
    } else {
        setSyncStatus('error');
        setStatusMsg(`上传失败：${result.error || '请检查配置或网络'}`);
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!confirm("确定要从 WebDAV 恢复吗？这将覆盖当前的本地数据。")) return;
    
    setSyncStatus('downloading');
    setStatusMsg('正在下载...');
    const result = await downloadBackup(config);
    
    if (result.success && result.data) {
        onRestore(result.data.links, result.data.categories);
        setSyncStatus('success');
        setStatusMsg('恢复成功！');
    } else {
        setSyncStatus('error');
        setStatusMsg(`恢复失败：${result.error || '文件格式错误'}`);
    }
  };

  const handleExportHtml = () => {
    const html = generateBookmarkHtml(links, categories);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadHtmlFile(html, `bookmarks_${dateStr}.html`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <Cloud className="text-blue-500" /> 备份与恢复
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* Section 1: WebDAV Configuration */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium text-slate-800 dark:text-slate-200">WebDAV 设置 (坚果云/Nextcloud等)</h4>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={config.enabled}
                            onChange={(e) => setConfig({...config, enabled: e.target.checked})}
                            className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">启用 WebDAV</span>
                    </label>
                </div>

                <div className={`space-y-3 transition-opacity ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">服务器地址 (URL)</label>
                        <input 
                            type="text" 
                            value={config.url}
                            onChange={(e) => setConfig({...config, url: e.target.value})}
                            placeholder="https://dav.jianguoyun.com/dav/"
                            className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">用户名</label>
                            <input 
                                type="text" 
                                value={config.username}
                                onChange={(e) => setConfig({...config, username: e.target.value})}
                                className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">应用密码</label>
                            <input 
                                type="password" 
                                value={config.password}
                                onChange={(e) => setConfig({...config, password: e.target.value})}
                                className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 pt-2">
                        <button 
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
                        >
                            {isTesting ? '连接中...' : '测试连接'}
                        </button>
                        <button 
                            onClick={handleSaveConfig}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors flex items-center gap-1"
                        >
                            <Save size={12} /> 保存配置
                        </button>
                        {testResult === 'success' && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 size={12}/> 连接成功</span>}
                        {testResult === 'fail' && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> 连接失败</span>}
                    </div>
                    {testResult === 'fail' && testError && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
                            错误详情：{testError}
                        </div>
                    )}
                </div>
            </section>

            <hr className="border-slate-200 dark:border-slate-700" />

            {/* Section 2: Sync Actions */}
            <section className="space-y-4">
                <h4 className="font-medium text-slate-800 dark:text-slate-200">云端同步操作</h4>
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={handleBackupToCloud}
                        disabled={!config.enabled}
                        className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        <Upload className="w-8 h-8 text-blue-500 mb-2 group-hover:-translate-y-1 transition-transform" />
                        <span className="text-sm font-medium dark:text-white">上传备份到 WebDAV</span>
                        <span className="text-xs text-slate-500 mt-1">覆盖云端数据</span>
                    </button>

                    <button 
                        onClick={handleRestoreFromCloud}
                        disabled={!config.enabled}
                        className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        <Download className="w-8 h-8 text-purple-500 mb-2 group-hover:-translate-y-1 transition-transform" />
                        <span className="text-sm font-medium dark:text-white">从 WebDAV 恢复</span>
                        <span className="text-xs text-slate-500 mt-1">覆盖本地数据</span>
                    </button>
                </div>
                
                {syncStatus !== 'idle' && (
                    <div className={`text-sm text-center p-2 rounded ${
                        syncStatus === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 
                        syncStatus === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 
                        'bg-blue-50 text-blue-600 dark:bg-blue-900/20'
                    }`}>
                        {statusMsg}
                    </div>
                )}
            </section>

            <hr className="border-slate-200 dark:border-slate-700" />

             {/* Section 3: HTML Export */}
             <section className="space-y-4">
                <h4 className="font-medium text-slate-800 dark:text-slate-200">本地导出</h4>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 flex items-center justify-between">
                    <div>
                        <h5 className="text-sm font-medium dark:text-slate-200">导出 HTML 书签文件</h5>
                        <p className="text-xs text-slate-500 mt-1">兼容 Chrome, Edge, Firefox 导入格式，保留目录结构</p>
                    </div>
                    <button 
                        onClick={handleExportHtml}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-blue-500 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <Download size={16} /> 导出 HTML
                    </button>
                </div>
             </section>

        </div>
      </div>
    </div>
  );
};

export default BackupModal;