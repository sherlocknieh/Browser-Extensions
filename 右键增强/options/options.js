// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadEngines();
    
    // 添加事件监听器
    const addEngineBtn = document.getElementById('addEngineBtn');
    if (addEngineBtn) {
        addEngineBtn.addEventListener('click', addEngine);
    }
});

// 加载搜图引擎列表
function loadEngines() {
    chrome.runtime.sendMessage({ action: 'getCustomImageSearchEngines' }, (response) => {
        if (response && response.engines) {
            displayEngines(response.engines);
        }
    });
}

// 显示搜索引擎列表
function displayEngines(engines) {
    const enginesList = document.getElementById('enginesList');
    
    if (engines.length === 0) {
        enginesList.innerHTML = '<p style="color: #666;">暂无自定义搜图引擎</p>';
        return;
    }
    
    enginesList.innerHTML = engines.map(engine => `
        <div class="engine-item">
            <div class="engine-info">
                <div class="engine-name">${escapeHtml(engine.name)}</div>
                <div class="engine-url">${escapeHtml(engine.url)}</div>
            </div>
            <div>
                <button data-engine-id="${engine.id}" data-enabled="${engine.enabled}" class="toggle-btn">
                    ${engine.enabled ? '禁用' : '启用'}
                </button>
                <button class="delete-btn" data-engine-id="${engine.id}">删除</button>
            </div>
        </div>
    `).join('');
    
    // 为动态生成的按钮添加事件监听器
    addEngineEventListeners();
}

// 添加新的搜图引擎
function addEngine() {
    const name = document.getElementById('engineName').value.trim();
    const url = document.getElementById('engineUrl').value.trim();
    
    if (!name || !url) {
        showStatus('请填写搜图引擎名称和链接', 'error');
        return;
    }
    
    if (!url.includes('%s')) {
        showStatus('搜图链接必须包含 %s 占位符', 'error');
        return;
    }
    
    // 获取现有引擎列表
    chrome.runtime.sendMessage({ action: 'getCustomImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        
        // 创建新引擎
        const newEngine = {
            id: Date.now().toString(),
            name: name,
            url: url,
            enabled: true
        };
        
        engines.push(newEngine);
        
        // 保存到storage
        chrome.runtime.sendMessage({ 
            action: 'saveCustomImageSearchEngines', 
            engines: engines 
        }, (response) => {
            if (response?.success) {
                showStatus('搜图引擎添加成功', 'success');
                document.getElementById('engineName').value = '';
                document.getElementById('engineUrl').value = '';
                loadEngines(); // 重新加载列表
            } else {
                showStatus('添加失败，请重试', 'error');
            }
        });
    });
}

// 切换搜图引擎启用状态
function toggleEngine(id, enabled) {
    chrome.runtime.sendMessage({ action: 'getCustomImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        const engine = engines.find(e => e.id === id);
        
        if (engine) {
            engine.enabled = enabled;
            
            chrome.runtime.sendMessage({ 
                action: 'saveCustomImageSearchEngines', 
                engines: engines 
            }, (response) => {
                if (response?.success) {
                    showStatus(`搜图引擎已${enabled ? '启用' : '禁用'}`, 'success');
                    loadEngines();
                }
            });
        }
    });
}

// 删除搜图引擎
function deleteEngine(id) {
    if (!confirm('确定要删除这个搜图引擎吗？')) {
        return;
    }
    
    chrome.runtime.sendMessage({ action: 'getCustomImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        const filteredEngines = engines.filter(e => e.id !== id);
        
        chrome.runtime.sendMessage({ 
            action: 'saveCustomImageSearchEngines', 
            engines: filteredEngines 
        }, (response) => {
            if (response?.success) {
                showStatus('搜图引擎删除成功', 'success');
                loadEngines();
            }
        });
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

// 为动态生成的按钮添加事件监听器
function addEngineEventListeners() {
    // 为切换按钮添加事件监听器
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const engineId = this.dataset.engineId;
            const enabled = this.dataset.enabled === 'true';
            toggleEngine(engineId, !enabled);
        });
    });
    
    // 为删除按钮添加事件监听器
    const deleteBtns = document.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const engineId = this.dataset.engineId;
            deleteEngine(engineId);
        });
    });
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
