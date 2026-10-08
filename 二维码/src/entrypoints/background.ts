// WXT 规定的后台脚本入口
export default defineBackground(() => {
    // [Firefox MV2 兼容] 检测浏览器类型，确定使用哪个 context 值
    const actionContext = browser.action ? "action" : "browser_action";

    // [Firefox MV2 兼容] browserAction 的 openPopup 未包含在类型定义中
    type OpenPopupCapable = { openPopup?: () => Promise<void> };

    // 根据 manifest 选择对应的 action API, 避免调用不存在的命名空间
    // 右键唤起时优先地址栏 page_action, 其次工具栏 action / browser_action
    const resolveActionApi = (): OpenPopupCapable | undefined => {
        const manifest = browser.runtime.getManifest() as Record<string, unknown>;
        const pageAction = browser.pageAction as unknown as OpenPopupCapable | undefined;
        const browserAction = browser.browserAction as unknown as OpenPopupCapable | undefined;
        const candidates: (OpenPopupCapable | undefined)[] = [];
        if (manifest.page_action) candidates.push(pageAction);
        if (manifest.browser_action) candidates.push(browserAction);
        if (manifest.action) candidates.push(browser.action);
        candidates.push(pageAction, browser.action, browserAction);
        return candidates.find((candidate) => typeof candidate?.openPopup === "function");
    };

    // 兼容打开 popup：优先 action API, 最后兜底新标签页
    const openPopupCompat = async (hash = "") => {
        const action = resolveActionApi();
        if (action?.openPopup) {
            try {
                await action.openPopup();
                return;
            } catch (error) {
                console.warn("openPopup 调用失败，使用新标签页打开:", error);
            }
        }

        // 无法调用原生 popup 时, 退而求其次打开一个小弹窗(而非整页新标签)
        await browser.windows.create({
            url: browser.runtime.getURL(`/popup.html${hash}`),
            type: "popup",
            width: 268,
            height: 320,
        });
    };

    // 右键菜单选中文字/链接后, 把文本交给 popup 生成二维码
    const requestQrFromText = (text?: string) => {
        const value = text?.trim();
        if (!value) return;

        // 先写入文本, 再同步调用 openPopup
        const storage = browser.storage.session ?? browser.storage.local;
        void storage.set({ qrCodeText: value });
        // Firefox 要求 openPopup 必须在用户手势处理函数中调用, 不能先 await
        void openPopupCompat(`#text=${encodeURIComponent(value)}`);
    };
    
    // 创建右键菜单
    browser.runtime.onInstalled.addListener(() => {
        // 清理旧菜单
        browser.contextMenus.removeAll(() => {
            // 添加菜单: 链接生成二维码
            browser.contextMenus.create({
                id: "generateQR_link",
                title: browser.i18n.getMessage("generateQR_link"),
                contexts: ["link"]
            });
            // 添加菜单: 选中文字生成二维码
            browser.contextMenus.create({
                id: "generateQR_selection",
                title: browser.i18n.getMessage("generateQR_selection"),
                contexts: ["selection"]
            });
            // 添加菜单: 识别图中二维码
            browser.contextMenus.create({
                id: "decodeQR",
                title: browser.i18n.getMessage("decodeQR"),
                contexts: ["image"]
            });
            // 添加菜单: 截屏识别二维码
            browser.contextMenus.create({
                id: "screenshotQR",
                title: browser.i18n.getMessage("screenShot"),
                contexts: [actionContext, "image"]
            });
            // 添加菜单: 粘贴图片识别二维码
            browser.contextMenus.create({
                id: "pasteImageQR",
                title: browser.i18n.getMessage("pasteImage"),
                contexts: [actionContext] // 在工具栏图标右键菜单中显示
            });
        });
    });

    // 右键菜单点击事件处理
    browser.contextMenus.onClicked.addListener((info, tab) => {
        const tabId = tab?.id;      // 获取当前标签页 ID
        if (tabId == null) {
            console.warn('tabId is null');  // tabId 不存在则警告并返回
            return;
        } else if (info.menuItemId === "generateQR_link") {
            // 链接生成二维码
            requestQrFromText(info.linkUrl);
        } else if (info.menuItemId === "generateQR_selection") {
            // 选中文字生成二维码
            requestQrFromText(info.selectionText);
        } else if (info.menuItemId === "decodeQR") {
            // 页面图片二维码识别
            browser.tabs.sendMessage(tabId, {
                action: "decodeQR",
                imageUrl: info.srcUrl
            });   // 此URL会包含域名, 无论图片是否用了相对路径
        } else if (info.menuItemId === "screenshotQR") {
            // 截图识别二维码
            browser.tabs.sendMessage(tabId, {
                action: "screenshotQR"
            });
        } else if (info.menuItemId === "pasteImageQR") {
            // 粘贴图片识别二维码
            browser.tabs.sendMessage(tabId, {
                action: "pasteImageQR"
            });
        }
    });

    // 监听来自内容脚本的消息
    browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        // 跨域获取图片数据
        if (request.action === "fetchImage") {
            fetch(request.url)                       // 请求图片资源
                .then(response => response.blob())   // 获取图片的 Blob 数据
                .then(blob => {
                    const reader = new FileReader(); // 使用 FileReader 将 Blob 转为 Data URL
                    reader.onload = () => sendResponse({ success: true, dataUrl: reader.result }); // 读取完成后发送回 Data URL
                    reader.readAsDataURL(blob);      // 开始读取 Blob 数据
                })
                .catch(error => sendResponse({ success: false, error: error.message })); // 出错时发送错误信息
        }
        return true; // 保持通道开启
        // 防止 Error: The message port closed before a response was received.
    });

    // 火狐浏览器: 把图标显示在地址栏(page_action), 也是右键唤起 popup 的前提
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

    browser.tabs.onUpdated.addListener((tabId) => showPageAction(tabId));
    browser.tabs.onActivated.addListener(({ tabId }) => showPageAction(tabId));
    browser.runtime.onInstalled.addListener(() => showPageAction());
    browser.runtime.onStartup.addListener(() => showPageAction());
});
