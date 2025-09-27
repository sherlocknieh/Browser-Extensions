
// 扩展初始化 - 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    createContextMenus();
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    handleContextMenuClick(info, tab);
});


// 右键菜单创建函数
function createContextMenus() {
    // 清理旧菜单
    chrome.contextMenus.removeAll(() => {
        // 创建二维码识别菜单
        chrome.contextMenus.create({
            id: "decodeQR",
            title: "识别图中二维码",
            contexts: ["image"]
        });

        // 创建选中文字生成二维码菜单
        chrome.contextMenus.create({
            id: "generateQR_selection",
            title: "选中文字生成二维码",
            contexts: ["selection"]
        });

        // 创建链接生成二维码菜单
        chrome.contextMenus.create({
            id: "generateQR_link",
            title: "链接生成二维码",
            contexts: ["link"]
        });

        // 创建页面URL生成二维码菜单
        chrome.contextMenus.create({
            id: "generateQR_page",
            title: "当前页面生成二维码",
            contexts: ["page"]
        });
    });
}

// 右键菜单响应函数
function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "decodeQR") {
        // 识别图中二维码
        // 向 content.js 发送请求
        chrome.tabs.sendMessage(tab.id, {
            action: "decodeQR",
            imageUrl: info.srcUrl
        });
    } else if (info.menuItemId === "generateQR_selection") {
        // 选中文字生成二维码
        // 使用本地存储传递数据
        chrome.storage.local.set({ qrCodeText: info.selectionText }, () => {
            chrome.action.openPopup();
        });
    } else if (info.menuItemId === "generateQR_link") {
        // 链接生成二维码
        // 使用本地存储传递数据
        chrome.storage.local.set({ qrCodeText: info.linkUrl }, () => {
            chrome.action.openPopup();
        });
    } else if (info.menuItemId === "generateQR_page") {
        // 页面URL生成二维码
        // 直接打开popup
        chrome.action.openPopup();
    }
}
