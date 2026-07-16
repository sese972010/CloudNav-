
import { Category, LinkItem, WebDavConfig } from "../types";

export interface WebDavResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
}

// 将 WebDAV 服务器返回的状态码翻译为可读的错误信息
const explainWebDavStatus = (status: number): string => {
    switch (status) {
        case 401: return '认证失败：用户名或密码错误（坚果云请使用「应用密码」而非登录密码）';
        case 403: return '没有访问权限（该 WebDAV 路径禁止访问）';
        case 404: return 'WebDAV 路径不存在，请检查服务器地址 URL';
        case 405: return 'WebDAV 方法不允许（服务器可能不支持此操作）';
        case 409: return '目录冲突（父目录可能不存在）';
        case 502:
        case 503:
        case 504: return `WebDAV 服务器暂不可用 (HTTP ${status})`;
        default: return `WebDAV 服务器返回错误 (HTTP ${status})`;
    }
};

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

        // 代理接口本身返回错误（非 200）
        if (!response.ok) {
            const errorMsg = result?.error || `代理服务错误 (HTTP ${response.status})`;
            console.error(`WebDAV Proxy Error: ${response.status} - ${errorMsg}`);
            return { success: false, error: errorMsg, status: response.status };
        }

        // 代理接口返回 200，但 body 中的 success 可能为 false
        // 此时 body.status 才是 WebDAV 服务器的真实状态码
        const webdavSuccess = result?.success === true;
        const webdavStatus = result?.status;  // WebDAV 真实状态码

        if (!webdavSuccess) {
            // WebDAV 服务器返回了错误，使用真实状态码生成错误信息
            const realStatus = typeof webdavStatus === 'number' ? webdavStatus : response.status;
            const errorMsg = result?.error || explainWebDavStatus(realStatus);
            console.error(`WebDAV Server Error: ${realStatus} - ${errorMsg}`);
            return { success: false, error: errorMsg, status: realStatus };
        }

        return { success: true, data: result, status: webdavStatus || response.status };
    } catch (e: any) {
        console.error("WebDAV Proxy Network Error", e);
        return { success: false, error: e?.message || '网络连接失败，请检查 API 服务是否运行' };
    }
}

export const checkWebDavConnection = async (config: WebDavConfig): Promise<WebDavResult<boolean>> => {
    if (!config.url || !config.username || !config.password) {
        return { success: false, error: '请填写完整的配置信息' };
    }
    const result = await callWebDavProxy('check', config);
    if (result.success) {
        return { success: true, data: true, status: result.status };
    }
    return {
        success: false,
        error: result.error || '连接失败',
        status: result.status
    };
};

export const uploadBackup = async (config: WebDavConfig, data: { links: LinkItem[], categories: Category[] }): Promise<WebDavResult<boolean>> => {
    const result = await callWebDavProxy('upload', config, data);
    if (result.success) {
        return { success: true, data: true, status: result.status };
    }
    return {
        success: false,
        error: result.error || '上传失败',
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
