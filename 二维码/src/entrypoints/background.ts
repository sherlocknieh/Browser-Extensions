// WXT 后台脚本入口
import { POPUP_NOTICE_KEY, type PopupNoticePayload, type PopupNoticeRecord } from '@/services/popupNotice';

export default defineBackground(() => {

    // 优先使用内存态的 session 存储, 不可用时回退 local
    const storageArea = () => browser.storage.session ?? browser.storage.local;

    // popup 通过长连接告知自己的打开状态, 断开即代表已关闭
    let popupPort: Browser.runtime.Port | null = null;
    // openPopup 会短暂占用弹窗, 期间到达的通知直接等待 popup 读取存储
    let popupOpening = false;
    let lastPopupOpenAt = 0;
    const POPUP_OPEN_GRACE = 1500;

    // 打开扩展 popup 窗口
    // 防止报 browser.pageAction 没有 openPopup 方法的错误(Firefox 的 pageAction 支持 openPopup 方法)
    // Firefox 只允许在用户操作(如右键菜单点击)期间调用 openPopup, 异步流程中再调用会被拒绝
    const openPopup = () => {
        type OpenPopupCapable = { openPopup: () => Promise<void> };
        // 优先地址栏 page_action, 其次工具栏 action
        const action = browser.pageAction as unknown as OpenPopupCapable || browser.action;
        return action.openPopup().then(() => {
            lastPopupOpenAt = Date.now();
        });
    };

    // 页面通知先写入存储, 保证 popup 打开后能读到; 已打开的 popup 直接通过长连接推送
    let noticeSeq = 0;
    const clearNoticeIfCurrent = async (id: number) => {
        const stored = await storageArea().get(POPUP_NOTICE_KEY);
        const current = stored?.[POPUP_NOTICE_KEY] as PopupNoticeRecord | undefined;
        if (current?.id === id) await storageArea().remove(POPUP_NOTICE_KEY);
    };

    // 在用户操作期间先打开 popup 并显示加载通知,
    // 之后内容脚本产生的通知就能直接推送到已打开的 popup(Firefox 不支持异步打开)
    const openPopupWithLoadingNotice = () => {
        const record: PopupNoticeRecord = {
            id: ++noticeSeq,
            options: {
                toast: true,
                icon: 'info',
                title: browser.i18n.getMessage('decodingQR') || '正在识别二维码…',
                showCloseButton: true,
                loading: true,
            },
        };
        void storageArea().set({ [POPUP_NOTICE_KEY]: record });
        popupOpening = true;
        void openPopup()
            .catch(() => {
                void clearNoticeIfCurrent(record.id);
            })
            .finally(() => {
                popupOpening = false;
            });
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

    // 右键菜单初始化
    const addContextMenus = () => {
        browser.contextMenus.removeAll(() => {
            // 添加菜单: 识别图中二维码
            browser.contextMenus.create({
                id: "decodeQR",
                title: browser.i18n.getMessage("decodeQR"),
                contexts: ["image"]
            });
            // 添加菜单: 识别图中二维码 (直接打开的 SVG 是文档而非 <img>, 右键上下文为 page)
            browser.contextMenus.create({
                id: "decodeQRPage",
                title: browser.i18n.getMessage("decodeQRSvg"),
                contexts: ["page"],
                documentUrlPatterns: ["*://*/*.svg*", "file:///*.svg*"]
            });
            // 添加菜单: 选中文字生成二维码
            browser.contextMenus.create({
                id: "generateQR_selection",
                title: browser.i18n.getMessage("generateQR_selection"),
                contexts: ["selection"]
            });
            // 添加菜单: 粘贴图片识别二维码
            browser.contextMenus.create({
                id: "pasteImageQR",
                title: browser.i18n.getMessage("pasteImage"),
                contexts: ["action", "page_action"] // 在工具栏图标和地址栏 PageAction 右键菜单中显示
            });
            // 添加菜单: 截屏识别二维码
            browser.contextMenus.create({
                id: "screenshotQR",
                title: browser.i18n.getMessage("screenShot"),
                contexts: ["action", "image", "page_action"]
            });
            // 添加菜单: 链接生成二维码
            browser.contextMenus.create({
                id: "generateQR_link",
                title: browser.i18n.getMessage("generateQR_link"),
                contexts: ["link"]
            });
        });
    };

    // 右键菜单点击事件处理
    const handleContextMenusClick = (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => {
        const tabId = tab?.id;      // 获取当前标签页 ID
        if (tabId == null) {
            console.warn('tabId is null');  // tabId 不存在则警告并返回
            return;
        } else if (info.menuItemId === "generateQR_selection") {
            // 选中文字生成二维码
            showQRcode(info.selectionText);
        } else if (info.menuItemId === "decodeQR") {
            // 页面图片二维码识别: 先在用户操作期间打开 popup, 后续通知才能显示在 popup 里
            openPopupWithLoadingNotice();
            browser.tabs.sendMessage(tabId, {
                action: "decodeQR",
                imageUrl: info.srcUrl
            }).catch(() => {
                // 没有内容脚本时无法识别, 直接收起加载提示
                void storageArea().remove(POPUP_NOTICE_KEY);
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
            // 截图识别二维码: 同样需要先在用户操作期间打开 popup
            openPopupWithLoadingNotice();
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

    // 显示地址栏图标 (Firefox)
    const showPageAction = (tabId?: number) => {
        const pageAction = browser.pageAction;
        if (!pageAction) return;
        if (tabId != null) {
            pageAction.show(tabId);
            return;
        }
        browser.tabs.query({}).then((tabs) => {
            for (const tab of tabs) {
                if (tab.id != null) pageAction.show(tab.id);
            }
        });
    };

    // 内容脚本消息处理
    const handleContentScriptMessage = (request: any, _sender: Browser.runtime.MessageSender, sendResponse: (response: any) => void) => {
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
    browser.tabs.onUpdated.addListener((tabId) => showPageAction(tabId));   // 标签页加载完成后, 显示地址栏图标
    browser.contextMenus.onClicked.addListener(handleContextMenusClick);    // 右键菜单点击事件处理
    browser.runtime.onMessage.addListener(handleContentScriptMessage);      // 处理内容脚本的请求
});
