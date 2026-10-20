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
            // fire 会被后续结果通知替换; 用户若关闭通知则直接收起 popup
            void fire({ ...options, didOpen: () => showLoading() }).then((response) => {
                if (activeId !== record.id) return;
                activeId = null;
                if (response.dismiss === 'close') window.close();
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
