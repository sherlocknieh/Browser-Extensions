import { nextTick, reactive } from 'vue';

export type NotifyIcon = 'info' | 'success' | 'error' | 'warning';
export type NotifyDismissReason = 'cancel' | 'close' | 'replaced';

export interface NotifyOptions {
    toast?: boolean;
    icon?: NotifyIcon;
    title?: string;
    text?: string;
    showCloseButton?: boolean;
    showCancelButton?: boolean;
    confirmButtonText?: string;
    cancelButtonText?: string;
    didOpen?: () => void;
}

export interface NotifyResult {
    isConfirmed: boolean;
    isDismissed: boolean;
    dismiss?: NotifyDismissReason;
}

interface NotifyState {
    open: boolean;
    options: NotifyOptions;
    loading: boolean;
}

// 通知是全局单例: 同一时间只显示一个, 再次触发会先结束上一条
const state = reactive<NotifyState>({
    open: false,
    options: {},
    loading: false,
});

let resolveCurrent: ((result: NotifyResult) => void) | null = null;

function finish(result: NotifyResult) {
    const resolve = resolveCurrent;
    resolveCurrent = null;
    state.open = false;
    state.loading = false;
    resolve?.(result);
}

function settlePrevious() {
    if (!resolveCurrent) return;
    finish({ isConfirmed: false, isDismissed: true, dismiss: 'replaced' });
}

function fire(options: NotifyOptions = {}): Promise<NotifyResult> {
    settlePrevious();

    const promise = new Promise<NotifyResult>((resolve) => {
        resolveCurrent = resolve;
    });

    state.options = { ...options };
    state.loading = false;
    state.open = true;

    void nextTick(() => {
        if (state.open) options.didOpen?.();
    });

    return promise;
}

const close = () => finish({ isConfirmed: false, isDismissed: true, dismiss: 'close' });
const cancel = () => finish({ isConfirmed: false, isDismissed: true, dismiss: 'cancel' });
const confirm = () => finish({ isConfirmed: true, isDismissed: false });
const showLoading = () => {
    if (state.open) state.loading = true;
};

export function useNotify() {
    return { fire, close, cancel, confirm, showLoading };
}

// 供通知宿主组件读取状态与回调
export const notifyState = state;
export { cancel as cancelNotify, close as closeNotify, confirm as confirmNotify };
