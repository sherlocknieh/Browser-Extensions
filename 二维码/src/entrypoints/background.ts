// WXT 后台脚本入口
export default defineBackground(() => {

    // 生成并显示二维码
    const showQRcode = (text?: string) => {
        // 过滤空文本
        const value = text?.trim();
        if (!value) return;

        // 文本储存到本地
        const storage = browser.storage.session ?? browser.storage.local;
        void storage.set({ qrCodeText: value });

        // 防止报 browser.pageAction 没有 openPopup 方法的错误(Firefox 的 pageAction 支持 openPopup 方法)
        type OpenPopupCapable = { openPopup: () => Promise<void> };
        // 优先地址栏 page_action, 其次工具栏 action
        const action = browser.pageAction as unknown as OpenPopupCapable || browser.action;
        // 打开 popup 窗口
        action.openPopup();
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
        } else if (info.menuItemId === "pasteImageQR") {
            // 粘贴图片识别二维码
            browser.tabs.sendMessage(tabId, {
                action: "pasteImageQR"
            });
        } else if (info.menuItemId === "screenshotQR") {
            // 截图识别二维码
            browser.tabs.sendMessage(tabId, {
                action: "screenshotQR"
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
