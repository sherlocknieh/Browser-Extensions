// WXT 后台脚本入口
import {
    POPUP_NOTICE_KEY,
    type PopupNoticePayload,
    type PopupNoticeRecord,
} from '@/services/popupNotice';
import { getMenuIcon, type MenuIconName } from '@/services/menuIcons';

export default defineBackground(() => {

    // 优先使用内存态的 session 存储, 不可用时回退 local
    const storageArea = () => browser.storage.session ?? browser.storage.local;

    // 地址栏图标 (Firefox page action) 的显示状态, 持久化保存, 默认显示
    const PAGE_ACTION_VISIBLE_KEY = 'pageActionVisible';
    const isPageActionVisible = async () => {
        const stored = await browser.storage.local.get(PAGE_ACTION_VISIBLE_KEY);
        return stored[PAGE_ACTION_VISIBLE_KEY] !== false;
    };

    // popup 通过长连接告知自己的打开状态, 断开即代表已关闭
    let popupPort: Browser.runtime.Port | null = null;
    // openPopup 会短暂占用弹窗, 期间到达的通知直接等待 popup 读取存储
    let popupOpening = false;
    let lastPopupOpenAt = 0;
    const POPUP_OPEN_GRACE = 1500;

    // 打开扩展 popup 窗口
    // 必须优先用 action.openPopup: Firefox 的 pageAction.openPopup 声明了 requireUserInput,
    // 异步流程(如截图框选完成)中调用必定被拒绝; action.openPopup 只用
    // extensions.openPopupWithoutUserGesture.enabled 开关控制(默认开启), 不受手势限制。
    // 保留 pageAction 兜底, 以防个别构建关闭了该开关。
    const openPopup = async () => {
        type OpenPopupCapable = { openPopup?: () => Promise<void> };
        const candidates = [
            browser.action as unknown as OpenPopupCapable | undefined,
            browser.pageAction as unknown as OpenPopupCapable | undefined,
        ].filter((api): api is OpenPopupCapable => typeof api?.openPopup === 'function');

        let lastError: unknown = new Error('openPopup is unavailable');
        for (const api of candidates) {
            try {
                await api.openPopup!();
                lastPopupOpenAt = Date.now();
                return;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError;
    };

    // 页面通知先写入存储, 保证 popup 打开后能读到; 已打开的 popup 直接通过长连接推送
    let noticeSeq = 0;
    const clearNoticeIfCurrent = async (id: number) => {
        const stored = await storageArea().get(POPUP_NOTICE_KEY);
        const current = stored?.[POPUP_NOTICE_KEY] as PopupNoticeRecord | undefined;
        if (current?.id === id) await storageArea().remove(POPUP_NOTICE_KEY);
    };

    // 返回 false 表示当前无法显示 popup, 内容脚本将回退到页面内通知
    const showPopupNotification = async (payload?: PopupNoticePayload): Promise<boolean> => {
        if (!payload?.options) return false;

        // 通知总是先落盘, 无论 popup 是否已打开都能读到最新一条
        const record: PopupNoticeRecord = { ...payload, id: ++noticeSeq };
        await storageArea().set({ [POPUP_NOTICE_KEY]: record });

        if (popupPort) {
            try {
                popupPort.postMessage({ action: 'showNotification', payload: record });
                return true;
            } catch {
                popupPort = null;
            }
        }

        // popup 正在打开或刚刚打开: 它挂载后会读取最新通知
        if (popupOpening || Date.now() - lastPopupOpenAt < POPUP_OPEN_GRACE) return true;

        popupOpening = true;
        try {
            await openPopup();
            return true;
        } catch {
            await clearNoticeIfCurrent(record.id);
            return false;
        } finally {
            popupOpening = false;
        }
    };

    // 生成并显示二维码
    const showQRcode = (text?: string) => {
        // 过滤空文本
        const value = text?.trim();
        if (!value) return;

        // 文本储存到本地
        void storageArea().set({ qrCodeText: value });
        // 打开 popup 窗口, 由 popup 生成二维码
        void openPopup().catch(() => {});
    };

    // 在 SVG 文档等非 HTML 页面中, 内容脚本无法创建 canvas/popup 所需的 DOM,
    // 因此把图片地址交给 popup, 由扩展页面完成下载和识别。
    const showQrFromImagePage = (imageUrl?: string) => {
        if (!imageUrl) return;
        void storageArea().set({ qrImageUrl: imageUrl });
        void openPopup().catch(() => {});
    };

    // PDF 查看器等页面无法注入内容脚本, 改为由 popup 截取当前视口后识别
    const showCaptureScan = () => {
        void storageArea().set({ qrCaptureScan: true });
        void openPopup().catch(() => {});
    };

    // Firefox 支持为菜单项指定自定义图标 (Chrome 不支持, 因此仅在 Firefox 构建中传入);
    // 图标内嵌在 src/services/menuIcons.ts 中, 颜色跟随菜单主题自动变化
    const menuIcons = (name: MenuIconName) => import.meta.env.FIREFOX
        ? { icons: { 16: getMenuIcon(name) } }
        : {};

    // Chrome/Edge 不支持菜单图标, 用 emoji 前缀提升辨识度; Firefox 已有图标, 不重复添加
    type MenuMessageKey = 'decodeQR' | 'decodeQRSvg' | 'generateQR_selection' | 'pasteImage'
        | 'screenShot' | 'generateQR_link' | 'showPageAction' | 'hidePageAction';
    const menuTitle = (key: MenuMessageKey, emoji: string) => {
        const title = browser.i18n.getMessage(key);
        return import.meta.env.FIREFOX ? title : `${emoji} ${title}`;
    };

    // 右键菜单初始化
    const addContextMenus = async () => {
        const pageActionVisible = await isPageActionVisible();
        browser.contextMenus.removeAll(() => {
            // 添加菜单: 识别图中二维码
            browser.contextMenus.create({
                id: "decodeQR",
                title: menuTitle("decodeQR", "🔍"),
                contexts: ["image"],
                ...menuIcons("scan")
            });
            // 添加菜单: 识别图中二维码 (直接打开的 SVG 是文档而非 <img>, 右键上下文为 page)
            browser.contextMenus.create({
                id: "decodeQRPage",
                title: menuTitle("decodeQRSvg", "🔍"),
                contexts: ["page"],
                documentUrlPatterns: ["*://*/*.svg*", "file:///*.svg*"],
                ...menuIcons("scan")
            });
            // 添加菜单: 选中文字生成二维码
            browser.contextMenus.create({
                id: "generateQR_selection",
                title: menuTitle("generateQR_selection", "📝"),
                contexts: ["selection"],
                ...menuIcons("text")
            });
            // 添加菜单: 粘贴图片识别二维码
            browser.contextMenus.create({
                id: "pasteImageQR",
                title: menuTitle("pasteImage", "📋"),
                contexts: ["action", "page_action"], // 在工具栏图标和地址栏 PageAction 右键菜单中显示
                ...menuIcons("paste")
            });
            // 添加菜单: 截屏识别二维码
            browser.contextMenus.create({
                id: "screenshotQR",
                title: menuTitle("screenShot", "📷"),
                contexts: ["action", "image", "page_action"],
                ...menuIcons("screenshot")
            });
            // 添加菜单: 链接生成二维码
            browser.contextMenus.create({
                id: "generateQR_link",
                title: menuTitle("generateQR_link", "🔗"),
                contexts: ["link"],
                ...menuIcons("link")
            });
            // Firefox 地址栏图标开关: 工具栏图标右键可重新显示, 地址栏图标右键可关闭
            if (browser.pageAction) {
                browser.contextMenus.create({
                    id: "showPageAction",
                    title: menuTitle("showPageAction", "👁️"),
                    contexts: ["action"],
                    visible: !pageActionVisible,
                    ...menuIcons("show")
                });
                browser.contextMenus.create({
                    id: "hidePageAction",
                    title: menuTitle("hidePageAction", "🚫"),
                    contexts: ["page_action"],
                    visible: pageActionVisible,
                    ...menuIcons("hide")
                });
            }
        });
    };

    // 右键菜单点击事件处理
    const handleContextMenusClick = (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => {
        // 地址栏图标开关不依赖标签页
        if (info.menuItemId === "showPageAction") {
            void setPageActionVisible(true);
            return;
        }
        if (info.menuItemId === "hidePageAction") {
            void confirmHidePageAction();
            return;
        }
        const tabId = tab?.id;      // 获取当前标签页 ID
        if (tabId == null) {
            console.warn('tabId is null');  // tabId 不存在则警告并返回
            return;
        } else if (info.menuItemId === "generateQR_selection") {
            // 选中文字生成二维码
            showQRcode(info.selectionText);
        } else if (info.menuItemId === "decodeQR") {
            // 页面图片二维码识别, 识别过程的提示统一由 popup 显示
            browser.tabs.sendMessage(tabId, {
                action: "decodeQR",
                imageUrl: info.srcUrl
            });   // 此URL是包含域名的完整URL, 无论图片是否用了相对路径
        } else if (info.menuItemId === "decodeQRPage") {
            // 直接打开的 SVG 是 XML 文档, 内容脚本无法创建 canvas 和弹窗, 交给 popup 处理
            showQrFromImagePage(info.pageUrl ?? tab?.url);
        } else if (info.menuItemId === "pasteImageQR") {
            // 粘贴图片识别二维码
            browser.tabs.sendMessage(tabId, {
                action: "pasteImageQR"
            });
        } else if (info.menuItemId === "screenshotQR") {
            // 截图识别二维码: 优先使用内容脚本的区域截图
            browser.tabs.sendMessage(tabId, {
                action: "screenshotQR"
            }).catch(() => {
                // PDF 查看器等页面没有内容脚本, 回退到截取当前视口
                showCaptureScan();
            });
        } else if (info.menuItemId === "generateQR_link") {
            // 链接生成二维码
            showQRcode(info.linkUrl);
        }
    };

    // 同步"显示/关闭地址栏图标"菜单项的可见性, 只保留与当前状态对应的那一项
    const syncPageActionMenus = async (visible?: boolean) => {
        const current = visible ?? await isPageActionVisible();
        browser.contextMenus.update('showPageAction', { visible: !current }).catch(() => {});
        browser.contextMenus.update('hidePageAction', { visible: current }).catch(() => {});
    };

    // 显示/隐藏地址栏图标 (Firefox), 并记住状态
    const setPageActionVisible = async (visible: boolean) => {
        await browser.storage.local.set({ [PAGE_ACTION_VISIBLE_KEY]: visible });
        const pageAction = browser.pageAction;
        if (pageAction) {
            const tabs = await browser.tabs.query({});
            await Promise.all(tabs.map(async (tab) => {
                if (tab.id == null) return;
                try {
                    await (visible ? pageAction.show(tab.id) : pageAction.hide(tab.id));
                } catch {
                    // 个别标签页 (如扩展页面) 可能不允许操作, 忽略即可
                }
            }));
        }
        void syncPageActionMenus(visible);
    };

    // 隐藏地址栏图标前用统一的 popup 通知确认, 并提示如何重新显示
    const confirmHidePageAction = async () => {
        await showPopupNotification({
            options: {
                toast: false,
                icon: 'info',
                title: browser.i18n.getMessage('hidePageActionConfirmTitle'),
                text: browser.i18n.getMessage('hidePageActionConfirmText'),
                showCloseButton: true,
                showCancelButton: true,
                confirmButtonText: browser.i18n.getMessage('hidePageActionConfirmBtn'),
                cancelButtonText: browser.i18n.getMessage('cancelBtn'),
            },
            confirmAction: { kind: 'hidePageAction' },
        });
    };

    // 显示地址栏图标 (Firefox)
    const showPageAction = async (tabId?: number) => {
        const pageAction = browser.pageAction;
        if (!pageAction) return;
        try {
            if (!(await isPageActionVisible())) return;
            const tabs = tabId != null ? [{ id: tabId }] : await browser.tabs.query({});
            for (const tab of tabs) {
                if (tab.id == null) continue;
                try {
                    // show() 在部分类型定义中返回 void, 运行时则可能是 Promise
                    void Promise.resolve(pageAction.show(tab.id)).catch(() => {});
                } catch {
                    // 忽略受限标签页导致的失败
                }
            }
        } catch {
            // 忽略受限标签页导致的失败
        }
    };

    // 内容脚本消息处理
    const handleContentScriptMessage = (request: any, _sender: Browser.runtime.MessageSender, sendResponse: (response: any) => void) => {
        // 确认通知点击"隐藏图标"后才真正隐藏地址栏图标
        if (request.action === "hidePageActionConfirmed") {
            setPageActionVisible(false)
                .then(() => sendResponse({ success: true }))
                .catch(() => sendResponse({ success: false }));
            return true;
        }
        // 页面通知转发到 popup
        if (request.action === "showNotification") {
            showPopupNotification(request.payload)
                .then(success => sendResponse({ success }))
                .catch(() => sendResponse({ success: false }));
            return true;
        }
        // popup 已展示通知, 清理待展示内容
        if (request.action === "notificationResolved" || request.action === "notificationDismissed") {
            void clearNoticeIfCurrent(request.id);
            sendResponse({ success: true });
            return false;
        }
        // 截取当前标签页可见区域: 由后台调用可避免 getDisplayMedia 的屏幕共享提示条压缩页面视口
        if (request.action === "captureVisibleTab") {
            // 消息可能来自内容脚本(sender.tab), 也可能来自 popup(无 sender.tab)
            const resolveWindowId = async () => {
                if (_sender.tab?.windowId != null) return _sender.tab.windowId;
                const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
                return tab?.windowId;
            };
            resolveWindowId()
                .then(windowId =>
                    windowId == null
                        ? browser.tabs.captureVisibleTab({ format: "png" })
                        : browser.tabs.captureVisibleTab(windowId, { format: "png" }))
                .then(dataUrl => sendResponse({ success: true, dataUrl }))
                .catch(error => sendResponse({ success: false, error: error?.message ?? String(error) }));
            return true;
        }
        // popup 点击"改用截图识别"后, 让当前页面的内容脚本开始区域截图
        if (request.action === "requestScreenshot") {
            browser.tabs.query({ active: true, currentWindow: true })
                .then(([tab]) => {
                    if (tab?.id == null) throw new Error('No active tab.');
                    return browser.tabs.sendMessage(tab.id, { action: "screenshotQR" });
                })
                .then(() => sendResponse({ success: true }))
                .catch(() => sendResponse({ success: false }));
            return true;
        }
        // 跨域获取图片数据
        if (request.action === "fetchImage") {
            fetch(request.url)                       // 请求图片资源
                .then(response => response.blob())   // 获取图片的 Blob 数据
                .then(blob => {
                    const reader = new FileReader();    // 使用 FileReader 将 Blob 转为 Data URL
                    reader.onload = () => sendResponse({ success: true, dataUrl: reader.result }); // 读取完成后发送回 Data URL
                    reader.readAsDataURL(blob);      // 开始读取 Blob 数据
                })
                .catch(error => sendResponse({ success: false, error: error.message })); // 出错时发送错误信息
        }
        return true; // 保持通道开启
        // 防止 Error: The message port closed before a response was received.
    };

    // 事件监听
    browser.runtime.onConnect.addListener((port) => {
        if (port.name !== 'popup') return;
        popupPort = port;
        // 补推挂载期间写入的通知, 避免 openPopup 与端口连接之间的竞态导致通知丢失
        void storageArea().get(POPUP_NOTICE_KEY).then((stored) => {
            const record = stored?.[POPUP_NOTICE_KEY] as PopupNoticeRecord | undefined;
            if (record && popupPort === port) port.postMessage({ action: 'showNotification', payload: record });
        }).catch(() => {});
        port.onDisconnect.addListener(() => {
            if (popupPort === port) popupPort = null;
            lastPopupOpenAt = 0;
            // popup 关闭后清除未处理的通知, 避免下次打开时旧通知再次出现
            void storageArea().remove(POPUP_NOTICE_KEY).catch(() => {});
        });
    });
    browser.runtime.onInstalled.addListener(addContextMenus);               // 扩展安装完成后, 初始化右键菜单
    browser.runtime.onStartup.addListener(addContextMenus);                 // 浏览器启动时同步菜单可见状态
    browser.tabs.onUpdated.addListener((tabId) => void showPageAction(tabId)); // 标签页加载完成后, 显示地址栏图标
    browser.contextMenus.onClicked.addListener(handleContextMenusClick);    // 右键菜单点击事件处理
    browser.runtime.onMessage.addListener(handleContentScriptMessage);      // 处理内容脚本的请求
});
