import { onBeforeUnmount, onMounted } from 'vue';
import { useNotify } from '@/composables/useNotify';
import { toOpenableUrl } from '@/services/linkText';
import {
    POPUP_NOTICE_KEY,
    type PopupNoticeAction,
    type PopupNoticeRecord,
} from '@/services/popupNotice';

const storageArea = () => browser.storage.session ?? browser.storage.local;

// 在 popup 中展示来自内容脚本的通知, 并代替内容脚本执行打开链接/复制操作
export function usePopupNoticeHost() {
    const { fire, showLoading } = useNotify();

    // 当前由 popup 展示的远程通知 ID, 用于忽略已被替换的通知
    let activeId: number | null = null;
    let port: Browser.runtime.Port | null = null;

    async function runAction(action?: PopupNoticeAction) {
        if (!action) return;
        if (action.kind === 'screenshot') {
            // popup 随后会被关闭, 由后台转告内容脚本开始区域截图
            try {
                await browser.runtime.sendMessage({ action: 'requestScreenshot' });
            } catch {
                // 页面不支持截图时保持安静, 避免再叠一层通知
            }
            return;
        }
        if (action.kind === 'hidePageAction') {
            // 用户确认后再由后台隐藏地址栏图标
            try {
                await browser.runtime.sendMessage({ action: 'hidePageActionConfirmed' });
            } catch {
                // 后台不可用时保持安静
            }
            return;
        }
        if (action.kind === 'open') {
            window.open(toOpenableUrl(action.value), '_blank');
            return;
        }
        try {
            await navigator.clipboard.writeText(action.value);
        } catch {
            // 复制失败时保持安静, 避免再叠一层通知
        }
    }

    async function present(record?: PopupNoticeRecord) {
        if (!record?.options) return;
        if (activeId === record.id) return;
        activeId = record.id;

        const { loading, ...options } = record.options;
        if (loading) {
            // fire 会被后续结果通知替换; 用户点击按钮或关闭通知时收起 popup
            void fire({
                ...options,
                didOpen: loading ? () => showLoading() : undefined,
            }).then(async (response) => {
                if (activeId !== record.id) return;
                activeId = null;
                // 被后续通知替换时保持 popup 打开, 由新通知继续接管
                if (response.dismiss === 'replaced') return;
                const action = response.isConfirmed
                    ? record.confirmAction
                    : response.dismiss === 'cancel'
                        ? record.cancelAction
                        : response.dismiss === 'extra'
                            ? record.extraAction
                            : undefined;
                await runAction(action);
                void browser.runtime.sendMessage({ action: 'notificationResolved', id: record.id }).catch(() => {});
                window.close();
            });
            return;
        }

        const response = await fire({ ...options });
        if (activeId !== record.id) return;
        activeId = null;

        const action = response.isConfirmed
            ? record.confirmAction
            : response.dismiss === 'cancel'
                ? record.cancelAction
                : response.dismiss === 'extra'
                    ? record.extraAction
                    : undefined;
        await runAction(action);

        void browser.runtime.sendMessage({ action: 'notificationResolved', id: record.id }).catch(() => {});
        // popup 本身就是通知窗口, 处理完直接关闭
        window.close();
    }

    onMounted(async () => {
        // 长连接用于接收内容脚本触发的新通知, 断开时后台会清理未处理的通知
        port = browser.runtime.connect({ name: 'popup' });
        port.onMessage.addListener((message: { action?: string; payload?: PopupNoticeRecord }) => {
            if (message?.action === 'showNotification') void present(message.payload);
        });

        // popup 打开前写入的通知在挂载后读取
        try {
            const stored = await storageArea().get(POPUP_NOTICE_KEY);
            await present(stored?.[POPUP_NOTICE_KEY] as PopupNoticeRecord | undefined);
        } catch {
            // 存储不可用时忽略, 不影响 popup 的常规功能
        }
    });

    onBeforeUnmount(() => {
        port?.disconnect();
        port = null;
    });
}
