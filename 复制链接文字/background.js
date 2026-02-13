// 创建右键菜单
chrome.runtime.onInstalled.addListener((details) => {
    // 清理旧菜单
    chrome.contextMenus.removeAll(() => {
        // 复制链接文字菜单
        chrome.contextMenus.create({
            id: "copyLinkText",
            title: "复制链接文字",
            contexts: ["link"]
        });
    });
});

// 菜单点击处理
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // 复制链接文字
    if (info.menuItemId === "copyLinkText") {
        // 委托 content.js 进行复制
        chrome.tabs.sendMessage(tab.id, {
            action: "copyLinkText",
            linkUrl: info.linkUrl
        });
    }
});