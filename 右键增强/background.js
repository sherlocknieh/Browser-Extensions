
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
    console.log(request.action);
});


// 右键菜单创建函数
function createContextMenus() {
    // 清理旧菜单
    chrome.contextMenus.removeAll(() => {

        // 复制链接显示文字菜单
        chrome.contextMenus.create({
            id: "copyLinkText",
            title: "复制链接显示文字",
            contexts: ["link"]
        });

        // 图片右键菜单
        chrome.contextMenus.create({
            id: "handleImage",
            title: "处理图片",
            contexts: ["image"]
        });
    });
}

// 右键菜单响应函数
function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "copyLinkText") {
        // 将复制操作委托给 content script，传递所有可能的链接信息
        chrome.tabs.sendMessage(tab.id, {
            action: "copyLinkText", 
            linkText: info.linkText,
            linkUrl: info.linkUrl,
            selectionText: info.selectionText
        }).catch(err => {
            console.error("发送消息到 content script 失败:", err);
        });
    }
    else if (info.menuItemId === "handleImage") {
        // 将图片处理操作委托给 content script
        chrome.tabs.sendMessage(tab.id, {
            action: "handleImage", 
            imageUrl: info.srcUrl
        }).catch(err => {
            console.error("发送消息到 content script 失败:", err);
        });
    }
}
