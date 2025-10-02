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
    // 只在首次安装时设置默认配置，避免覆盖用户配置
    if (details.reason === 'install') {
        chrome.storage.local.set({imageSearchEngines: DefaultEngines()});
    }
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
    // 清理旧菜单并重新创建
    chrome.contextMenus.removeAll(() => {
        createMenuItems();
    });
}

// 创建菜单项的具体逻辑
function createMenuItems() {
    try {
        // 复制链接文字菜单
        chrome.contextMenus.create({
            id: "copyLinkText",
            title: "复制链接文字",
            contexts: ["link"]
        }, () => {
            if (chrome.runtime.lastError) {
                console.log('创建复制链接菜单:', chrome.runtime.lastError.message);
            }
        });

        // 图片搜索菜单
        chrome.contextMenus.create({
            id: "searchImage",
            title: "图片搜索",
            contexts: ["image"]
        }, () => {
            if (chrome.runtime.lastError) {
                console.log('创建图片搜索菜单:', chrome.runtime.lastError.message);
            } else {
                // 只有在主菜单创建成功后才创建子菜单
                createImageSubMenus();
            }
        });
    } catch (error) {
        console.error('创建菜单时发生错误:', error);
    }
}

// 创建图片搜索子菜单
function createImageSubMenus() {
    // 一键搜图选项
    chrome.contextMenus.create({
        id: "searchImageAll",
        title: "🔍 一键搜索",
        contexts: ["image"],
        parentId: "searchImage"
    }, () => {
        if (chrome.runtime.lastError) {
            console.log('创建一键搜索菜单:', chrome.runtime.lastError.message);
        }
    });

    // 分隔符
    chrome.contextMenus.create({
        id: "imageSeparator",
        type: "separator",
        contexts: ["image"],
        parentId: "searchImage"
    }, () => {
        if (chrome.runtime.lastError) {
            console.log('创建分隔符:', chrome.runtime.lastError.message);
        }
    });

    // 添加搜图引擎
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        const engines = result.imageSearchEngines || DefaultEngines();
        engines.forEach((engine, index) => {
            if (engine.enabled) {
                const menuId = `engine-${index}-${engine.name}`;
                chrome.contextMenus.create({
                    id: menuId,
                    title: engine.name,
                    contexts: ["image"],
                    parentId: "searchImage"
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.log(`创建引擎菜单 ${engine.name}:`, chrome.runtime.lastError.message);
                    }
                });
            }
        });
    });
}


// 右键菜单操作处理
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


// 单个引擎搜图
function handleSingleEngineSearch(menuItemId, imageUrl) {
    chrome.storage.local.get(['imageSearchEngines'], (result) => {
        // 获取所有引擎列表
        const engines = result.imageSearchEngines || DefaultEngines();
        
        let engine = null;
        
        // 检查是否是新格式的ID (engine-index-name)
        if (menuItemId.startsWith('engine-')) {
            const parts = menuItemId.split('-');
            if (parts.length >= 3) {
                const index = parseInt(parts[1]);
                const engineName = parts.slice(2).join('-');
                
                // 优先通过索引查找，如果索引无效则通过名称查找
                engine = engines[index];
                if (!engine || engine.name !== engineName) {
                    engine = engines.find(e => e.name === engineName);
                }
            }
        } else {
            // 兼容旧格式，直接通过名称查找
            engine = engines.find(e => e.name === menuItemId);
        }
        
        if (engine) {
            // 构造搜索URL
            const searchUrl = engine.url.replace('%s', encodeURIComponent(imageUrl));
            // 前台打开新标签页进行搜索
            chrome.tabs.create({ url: searchUrl });
        }
    });
}


// 一键搜图
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
    if (request.action === 'resetToDefaults') {
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

