
import { Category, LinkItem, WebDavConfig } from "../types";

export interface WebDavResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
}

const callWebDavProxy = async (operation: 'check' | 'upload' | 'download', config: WebDavConfig, payload?: any): Promise<WebDavResult> => {
    try {
        const response = await fetch('/api/webdav', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation,
                config,
                payload
            })
        });

        let result: any;
        try {
            result = await response.json();
        } catch {
            result = {};
        }
        
        if (!response.ok) {
            const errorMsg = result?.error || `HTTP ${response.status}`;
            console.error(`WebDAV Proxy Error: ${response.status} - ${errorMsg}`);
            return { success: false, error: errorMsg, status: response.status };
        }
        
        return { success: result?.success !== false, data: result, status: response.status };
    } catch (e: any) {
        console.error("WebDAV Proxy Network Error", e);
        return { success: false, error: e?.message || '网络连接失败，请检查API服务是否运行' };
    }
}

export const checkWebDavConnection = async (config: WebDavConfig): Promise<WebDavResult<boolean>> => {
    if (!config.url || !config.username || !config.password) {
        return { success: false, error: '请填写完整的配置信息' };
    }
    const result = await callWebDavProxy('check', config);
    if (result.success && result.data?.success) {
        return { success: true, data: true, status: result.status };
    }
    return { 
        success: false, 
        error: result.error || `连接失败 (HTTP ${result.status || 'unknown'})`, 
        status: result.status 
    };
};

export const uploadBackup = async (config: WebDavConfig, data: { links: LinkItem[], categories: Category[] }): Promise<WebDavResult<boolean>> => {
    const result = await callWebDavProxy('upload', config, data);
    if (result.success && result.data?.success) {
        return { success: true, data: true, status: result.status };
    }
    return { 
        success: false, 
        error: result.error || `上传失败 (HTTP ${result.status || 'unknown'})`, 
        status: result.status 
    };
};

export const downloadBackup = async (config: WebDavConfig): Promise<WebDavResult<{ links: LinkItem[], categories: Category[] }>> => {
    const result = await callWebDavProxy('download', config);
    
    if (result.success && result.data && Array.isArray(result.data.links) && Array.isArray(result.data.categories)) {
        return { success: true, data: result.data };
    }
    return { 
        success: false, 
        error: result.error || '下载失败或文件格式错误', 
        status: result.status 
    };
};
