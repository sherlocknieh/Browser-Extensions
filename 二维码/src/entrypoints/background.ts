// WXT 后台脚本入口
export default defineBackground(() => {

    // 优先使用内存态的 session 存储, 不可用时回退 local
    const storageArea = () => browser.storage.session ?? browser.storage.local;

    // 打开扩展 popup 窗口
    // 防止报 browser.pageAction 没有 openPopup 方法的错误(Firefox 的 pageAction 支持 openPopup 方法)
    const openPopup = () => {
        type OpenPopupCapable = { openPopup: () => Promise<void> };
        // 优先地址栏 page_action, 其次工具栏 action
        const action = browser.pageAction as unknown as OpenPopupCapable || browser.action;
        action.openPopup();
    };

    // 生成并显示二维码
    const showQRcode = (text?: string) => {
        // 过滤空文本
        const value = text?.trim();
        if (!value) return;

        // 文本储存到本地
        void storageArea().set({ qrCodeText: value });
        // 打开 popup 窗口, 由 popup 生成二维码
        openPopup();
    };

    // 在 SVG 文档等非 HTML 页面中, 内容脚本无法创建 canvas/popup 所需的 DOM,
    // 因此把图片地址交给 popup, 由扩展页面完成下载和识别。
    const showQrFromImagePage = (imageUrl?: string) => {
        if (!imageUrl) return;
        void storageArea().set({ qrImageUrl: imageUrl });
        openPopup();
    };

    // PDF 查看器等页面无法注入内容脚本, 改为由 popup 截取当前视口后识别
    const showCaptureScan = () => {
        void storageArea().set({ qrCaptureScan: true });
        openPopup();
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
            // 页面图片二维码识别
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
    browser.runtime.onInstalled.addListener(addContextMenus);               // 扩展安装完成后, 初始化右键菜单
    browser.tabs.onUpdated.addListener((tabId) => showPageAction(tabId));   // 标签页加载完成后, 显示地址栏图标
    browser.contextMenus.onClicked.addListener(handleContextMenusClick);    // 右键菜单点击事件处理
    browser.runtime.onMessage.addListener(handleContentScriptMessage);      // 处理内容脚本的请求
});
