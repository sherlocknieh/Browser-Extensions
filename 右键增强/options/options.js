// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    // 加载搜索引擎列表
    loadEngines();
});


// 加载搜图引擎列表
function loadEngines() {
    chrome.runtime.sendMessage({ action: 'getImageSearchEngines' }, (response) => {
        if (response && response.engines) {

            const engines = response.engines;
            const enginesList = document.getElementById('enginesList');

            if (engines.length === 0) {
                enginesList.innerHTML = '<p style="color: #666;">暂无自定义搜图引擎</p>';
                return;
            }

            enginesList.innerHTML = engines.map(engine => `
                <div class="engine-item">
                    <label>
                        <input type="checkbox" data-engine-id="${engine.name}" class="engine-checkbox" ${engine.enabled ? 'checked' : ''}>
                        <input type="text" class="engine-name" data-engine-id="${engine.id}" value="${escapeHtml(engine.name)}" readonly style="width: 200px;">
                        <input type="text" class="engine-url" data-engine-id="${engine.id}" value="${escapeHtml(engine.url)}" style="width: 400px;">
                        <button class="edit-btn" data-engine-id="${engine.id}">更新</button>
                        <button class="delete-btn" data-engine-id="${engine.id}">删除</button>
                    </label>
                </div>
            `).join('');

            const newEngineTemplate = `
                <div class="engine-item">
                    <label>
                        <input type="checkbox" disabled style="visibility: hidden;">
                        <input type="text" id="new-engine-name" placeholder="新引擎名称" style="width: 200px;">
                        <input type="text" id="new-engine-url" placeholder="新引擎 URL (用 %s 占位)" style="width: 400px;">
                        <button id="add-engine-btn">添加</button>
                    </label>
                </div>
            `;

            enginesList.innerHTML += newEngineTemplate;

            // 监听页面各种按钮点击
            addEventListeners();
        }
    });
}


// 添加事件监听器
function addEventListeners() {
    // 配置导出按钮
    const exportConfigBtn = document.getElementById('exportConfigBtn');
    if (exportConfigBtn) {exportConfigBtn.addEventListener('click', exportConfig);}
    // 配置导入按钮
    const importConfigFile = document.getElementById('importConfigFile');
    if (importConfigFile) { importConfigFile.addEventListener('change', importConfig);}
    // 重置配置按钮
    const resetConfigBtn = document.getElementById('resetConfigBtn');
    if (resetConfigBtn) {resetConfigBtn.addEventListener('click', resetConfig);}
}


// 导出配置
function exportConfig() {
    // 获取所有相关配置
    chrome.storage.local.get('imageSearchEngines', (result) => {
        const config = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            imageSearchEngines: result.imageSearchEngines || [],
        };
        
        // 创建下载链接
        const configJson = JSON.stringify(config, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });


        chrome.downloads.download({
            url: URL.createObjectURL(blob),
            filename: `右键增强配置.${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.json`,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                // 用户取消或者其他错误
                if (chrome.runtime.lastError.message.includes('cancelled')) {
                    showStatus('导出已取消', 'info');
                } else {
                    showStatus(`配置导出失败: ${chrome.runtime.lastError.message}`, 'error');
                }
            }
            // 成功启动下载后，不再此处显示成功消息，
            // 而是由 background.js 监听下载完成事件来显示。
        });
    });
}


// 导入配置
function importConfig(event) {
    const file = event.target.files[0];
    if (!file) {
        showStatus('未选择文件', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // 解析JSON
            const config = JSON.parse(e.target.result);
            
            // 验证配置文件的基本结构和数据
            if (!config || !Array.isArray(config.imageSearchEngines)) {
                throw new Error('配置文件格式不正确或缺少引擎数据');
            }
            
            // 确认导入
            const engineCount = config.imageSearchEngines.length;
            if (!confirm(`确定要导入配置吗？\n\n将导入 ${engineCount} 个搜图引擎。\n导入时间：${config.exportTime ? new Date(config.exportTime).toLocaleString() : '未知'}\n\n注意：这将覆盖当前所有搜图引擎设置！`)) {
                event.target.value = ''; // 清空文件输入
                return;
            }

            // 直接使用解析出的引擎配置进行保存
            chrome.storage.local.set({ imageSearchEngines: config.imageSearchEngines }, () => {
                showStatus(`配置导入成功！已导入 ${engineCount} 个引擎`, 'success');
                // 重新加载页面数据以显示新配置
                loadEngines();
            });

        } catch (error) {
            showStatus(`导入失败：${error.message}`, 'error');
            console.error('Config import error:', error);
        } finally {
            // 无论成功或失败，都清空文件输入框，以便可以再次选择同一个文件
            event.target.value = '';
        }
    };

    reader.readAsText(file);
}


// 重置配置
function resetConfig() {
    if (!confirm('确定要重置所有配置吗？\n\n这将：\n• 恢复默认的Google和Yandex引擎\n• 删除所有自定义引擎\n• 重置所有设置为默认值\n\n此操作无法撤销！')) {
        return;
    }
    
    // 发送重置消息到后台
    chrome.runtime.sendMessage({ action: 'resetToDefaults' }, (response) => {
        if (response?.success) {
            showStatus('配置已重置为默认值', 'success');
            
            // 重新加载页面数据
            loadEngines();
            loadUseSimpleMenu();
            loadBatchSearchSettings();
        } else {
            showStatus('重置失败，请重试', 'error');
        }
    });
}


// 显示状态消息
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.innerHTML = `<div class="status ${type}">${message}</div>`;
    
    // 3秒后自动隐藏
    setTimeout(() => {
        status.innerHTML = '';
    }, 3000);
}


// HTML转义函数，防止XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}
