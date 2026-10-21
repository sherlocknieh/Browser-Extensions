import { createApp, type App } from 'vue';
import ScreenshotOverlay from '@/components/ScreenshotOverlay.vue';

export type ScreenshotResult =
    | { type: 'failed' }
    | { type: 'cancelled'; silent?: boolean };

type CaptureResponse = { success: true; dataUrl: string } | { success: false; error?: string };

// 使用 captureVisibleTab 获取当前视口图像。
async function captureVisibleTab(): Promise<string> {
    let response: CaptureResponse | undefined;
    try {
        response = await browser.runtime.sendMessage({ action: 'captureVisibleTab' });
    } catch {
        throw { type: 'failed' } satisfies ScreenshotResult;
    }
    if (!response?.success || !response.dataUrl) {
        throw { type: 'failed' } satisfies ScreenshotResult;
    }
    return response.dataUrl;
}

export function useScreenshot() {
    const startScreenshot = async (): Promise<string> => {
        const src = await captureVisibleTab();

        return new Promise<string>((resolve, reject) => {
            const host = document.createElement('div');
            host.style.display = 'contents';
            document.body.appendChild(host);

            let app: App | undefined;
            let settled = false;

            // 组件自身的点击回调里同步卸载会中断渲染, 放到微任务中执行
            const dispose = () => {
                queueMicrotask(() => {
                    app?.unmount();
                    host.remove();
                });
            };

            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                action();
                dispose();
            };

            app = createApp(ScreenshotOverlay, {
                src,
                onConfirm: (dataUrl: string) => finish(() => resolve(dataUrl)),
                onCancel: () =>
                    finish(() => reject({ type: 'cancelled', silent: true } satisfies ScreenshotResult)),
                onError: () => finish(() => reject({ type: 'failed' } satisfies ScreenshotResult)),
            });
            app.mount(host);
        });
    };

    return { startScreenshot };
}
