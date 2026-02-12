// WXT 规定的后台脚本入口
export default defineBackground(() => {
    // 初始化右键菜单
    browser.runtime.onInstalled.addListener(() => {
        // 清理旧菜单
        browser.contextMenus.removeAll(() => {
            // 添加菜单: 为当前页面生成二维码
            browser.contextMenus.create({
                id: "generateQR_page",
                title: browser.i18n.getMessage("generateQR_page"),
                contexts: ["page"]
            });
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
                contexts: ["action", "image"]
            });
            // 添加菜单: 粘贴图片识别二维码
            browser.contextMenus.create({
                id: "pasteImageQR",
                title: browser.i18n.getMessage("pasteImage"),
                contexts: ["action"] // 在工具栏图标右键菜单中显示
            });
        });
    });

    // 监听右键菜单点击事件
    browser.contextMenus.onClicked.addListener((info, tab) => {
        const tabId = tab?.id;      // 获取当前标签页 ID
        if (tabId == null) {
            console.warn('tabId is null');  // tabId 不存在则警告并返回
            return;
        };

        if (info.menuItemId === "generateQR_page") {
            // 为当前页面生成二维码
            browser.action.openPopup();     // 直接打开popup
        } else if (info.menuItemId === "generateQR_link") {
            // 链接生成二维码
            browser.storage.local.set({ qrCodeText: info.linkUrl }, () => {
                browser.action.openPopup(); // 把链接写入本地存储后打开 popup
            });
        } else if (info.menuItemId === "generateQR_selection") {
            // 选中文字生成二维码
            browser.storage.local.set({ qrCodeText: info.selectionText }, () => {
                browser.action.openPopup(); // 把选中文字写入本地存储后打开 popup
            });
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
});
