// 默认引擎列表
function DefaultEngines() {
    return [
        {
            name: 'Google Lens',
            url: 'https://lens.google.com/uploadbyurl?url=%s',
            enabled: true,
        },
        {
            name: 'Yandex 搜图',
            url: 'https://yandex.com/images/search?rpt=imageview&url=%s',
            enabled: true,
        }
    ];
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
    // 写入默认配置
    chrome.storage.local.set({imageSearchEngines: DefaultEngines()});
    // 创建右键菜单
    createContextMenus();
});

// 监听存储变化，自动更新右键菜单
chrome.storage.onChanged.addListener((changes, namespace) => {
    // 确保是 local 存储区域且 imageSearchEngines 发生了变化
    if (namespace === 'local' && changes.imageSearchEngines) {
        createContextMenus();
    }
});

// 监听菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // 处理菜单点击
    handleContextMenuClick(info, tab);
});


// 创建右键菜单
function createContextMenus() {
    // 清理旧菜单
    chrome.contextMenus.removeAll(() => {
        // 复制链接文字菜单
        chrome.contextMenus.create({
            id: "copyLinkText",
            title: "复制链接文字",
            contexts: ["link"]
        });

        // 图片搜索菜单
        chrome.contextMenus.create({
            id: "searchImage",
            title: "图片搜索",
            contexts: ["image"]
        });

        // 一键搜图选项
        chrome.contextMenus.create({
            id: "searchImageAll",
            title: "🔍 一键搜索",
            contexts: ["image"],
            parentId: "searchImage"
        });

        // 分隔符
        chrome.contextMenus.create({
            id: "Separator",
            type: "separator",
            contexts: ["image"],
            parentId: "searchImage"
        });

        // 添加搜图引擎
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            const engines = result.imageSearchEngines || DefaultEngines();
            engines.forEach(engine => {
                if (engine.enabled) {
                    chrome.contextMenus.create({
                        id: engine.name,
                        title: engine.name,
                        contexts: ["image"],
                        parentId: "searchImage"
                    });
                }
            });
        });
    });
}

// 右键菜单响应函数
function handleContextMenuClick(info, tab) {
    // 复制链接文字
    if (info.menuItemId === "copyLinkText") {
        // 委托 content.js 进行复制
        chrome.tabs.sendMessage(tab.id, {
            action: "copyLinkText",
            linkUrl: info.linkUrl
        });
    }
    // 一键搜图
    else if (info.menuItemId === "searchImageAll") {
        handleAllEnginesSearch(info.srcUrl);
    }
    // 图片搜索
    else {
        handleSingleEngineSearch(info.menuItemId, info.srcUrl);
    }
}

// 处理单个引擎搜图
function handleSingleEngineSearch(menuItemId, imageUrl) {
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        // 获取所有引擎列表
        const engines = result.imageSearchEngines || DefaultEngines();
        // 查找对应引擎
        const engine = engines.find(e => e.name === menuItemId);
        if (engine) {
            // 构造搜索URL
            const searchUrl = engine.url.replace('%s', encodeURIComponent(imageUrl));
            // 前台打开新标签页进行搜索
            chrome.tabs.create({ url: searchUrl });
        }
    });
}

// 处理一键搜图
function handleAllEnginesSearch(imageUrl) {
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        // 获取所有搜图引擎
        const engines = result.imageSearchEngines || DefaultEngines();
        
        // 选出启用的引擎
        const urls = [];
        engines.forEach(engine => {
            if (engine.enabled) {
                urls.push({
                    name: engine.name,
                    url: engine.url.replace('%s', encodeURIComponent(imageUrl))
                });
            }
        });
        
        // 检查是否有引擎可用
        if (urls.length === 0) {
            console.warn('没有可用的搜图引擎');
            return;
        }

        urls.forEach((item, index) => {
            setTimeout(() => {
                // 后台打开标签页进行搜索
                chrome.tabs.create({ url: item.url, active: false });
            }, index * 100); // 每个标签页间隔100ms
        });
    });
}


// 设置页面消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 读取配置
    if (request.action === 'getImageSearchEngines') {
        chrome.storage.local.get(['imageSearchEngines'], (result) => {
            sendResponse({ engines: result.imageSearchEngines || DefaultEngines() });
        });
        return true;
    }
    // 重置配置
    else if (request.action === 'resetToDefaults') {
        const defaultSettings = {
            imageSearchEngines: DefaultEngines()
        };
        chrome.storage.local.set(defaultSettings, () => {
            createContextMenus(); // 重新创建菜单
            sendResponse({ success: true });
        });
        return true;
    }
});

