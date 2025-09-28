
// 初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
    createContextMenus();
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    handleContextMenuClick(info, tab);
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchImage") {
        fetch(request.url)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onload = () => sendResponse({success: true, dataUrl: reader.result});
                reader.readAsDataURL(blob);
            })
            .catch(error => sendResponse({success: false, error: error.message}));
        return true; // 保持消息通道开放
    }
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
        // 向 content.js 发起二维码识别消息
        chrome.tabs.sendMessage(tab.id, {
            action: "decodeQR",
            imageUrl: info.srcUrl
        }); // 即使图片用了相对路径, 此处URL也是含域名的完整链接
    } else if (info.menuItemId === "generateQR_selection") {
        // 选中文字生成二维码
        chrome.storage.local.set({ qrCodeText: info.selectionText }, () => {
            // 向本地存储写入数据后打开 popup
            chrome.action.openPopup();
        });
    } else if (info.menuItemId === "generateQR_link") {
        // 链接生成二维码
        chrome.storage.local.set({ qrCodeText: info.linkUrl }, () => {
            // 向本地存储写入数据后打开 popup
            chrome.action.openPopup();
        });
    } else if (info.menuItemId === "generateQR_page") {
        // 页面URL生成二维码
        // 直接打开popup
        chrome.action.openPopup();
    }
}
