// 默认引擎数据
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

// 扩展安装时初始化 (扩展安装/更新/重新启用时都会触发)
chrome.runtime.onInstalled.addListener((details) => {
    // 把默认配置备份到本地存储的 DefaultEngines 键
    chrome.storage.local.set({ DefaultEngines: DefaultEngines() });    // 用户想要重置配置时才会用到
    // 把默认配置写入本地存储的 SearchEngines 键 (仅在安装时触发)
    if (details.reason === 'install') {
        chrome.storage.local.set({ SearchEngines: DefaultEngines() }); // 实际使用的用户配置
    }
    // 创建右键菜单
    createContextMenus();
});


// 创建右键菜单
function createContextMenus() {
    chrome.contextMenus.removeAll(() => {
        // 图片搜索主菜单
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
            id: "imageSeparator",
            type: "separator",
            contexts: ["image"],
            parentId: "searchImage"
        });
        // 搜图引擎列表
        chrome.storage.local.get(['SearchEngines'], (result) => {
            const engines = result.SearchEngines || [];
            engines.forEach((engine, index) => {
                if (engine.enabled) {
                    const menuId = engine.name;
                    chrome.contextMenus.create({
                        id: menuId,
                        title: engine.name,
                        contexts: ["image"],
                        parentId: "searchImage"
                    });
                }
            });
        });
    });
}

// 菜单点击事件处理
chrome.contextMenus.onClicked.addListener((info, tab) => {

    // 一键搜图
    if (info.menuItemId === "searchImageAll") {
        handleAllEnginesSearch(info.srcUrl);
    }
    // 单引擎搜图
    else {
        handleSingleEngineSearch(info.menuItemId, info.srcUrl);
    }
});

// 监听存储变化，更新右键菜单
chrome.storage.onChanged.addListener((changes, namespace) => {
    // 确保是 local 存储区域且 SearchEngines 发生了变化
    if (namespace === 'local' && changes.SearchEngines) {
        createContextMenus();
    }
});

// 单引擎搜图
function handleSingleEngineSearch(menuItemId, imageUrl) {
    chrome.storage.local.get(['SearchEngines'], (result) => {
        // 获取所有引擎列表
        const engines = result.SearchEngines;
        // 找到对应的引擎
        const engine = engines.find(e => e.name === menuItemId);

        if (engine) {
            // 构造搜索URL
            const searchUrl = engine.url.replace('%s', encodeURIComponent(imageUrl));
            // 前台打开新标签页进行搜索
            chrome.tabs.create({ url: searchUrl });
        } else {
            console.warn('未找到对应的搜图引擎:', menuItemId);
        }
    });
}

// 一键搜图
function handleAllEnginesSearch(imageUrl) {
    chrome.storage.local.get(['SearchEngines'], (result) => {
        // 获取所有搜图引擎
        const engines = result.SearchEngines;

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
