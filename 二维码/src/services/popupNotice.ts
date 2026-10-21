import type { NotifyIcon } from '@/composables/useNotify';

// 页面通知统一转发给 popup 显示, 该键保存 popup 尚未展示的最新一条通知
export const POPUP_NOTICE_KEY = 'qrNotification';

// open/copy 由 popup 直接执行; screenshot 需要 popup 通知当前页面的内容脚本开始截图
export type PopupNoticeAction =
    | { kind: 'open'; value: string }
    | { kind: 'copy'; value: string }
    | { kind: 'screenshot' };

// 可跨进程传递的通知参数: didOpen 等函数无法序列化, 用 loading 标记加载状态
export interface PopupNoticeOptions {
    toast?: boolean;
    icon?: NotifyIcon;
    title?: string;
    text?: string;
    showCloseButton?: boolean;
    showCancelButton?: boolean;
    confirmButtonText?: string;
    cancelButtonText?: string;
    // 显示加载动画
    loading?: boolean;
}

export interface PopupNoticePayload {
    options: PopupNoticeOptions;
    confirmAction?: PopupNoticeAction;
    cancelAction?: PopupNoticeAction;
}

export interface PopupNoticeRecord extends PopupNoticePayload {
    id: number;
}

// 交给 popup 显示; 返回 false 表示 popup 不可用, 调用方应回退到页面内通知
export async function showPopupNotice(payload: PopupNoticePayload): Promise<boolean> {
    try {
        const response = await browser.runtime.sendMessage({ action: 'showNotification', payload });
        return response?.success === true;
    } catch {
        return false;
    }
}
