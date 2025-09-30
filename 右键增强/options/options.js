// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadEngines();
    loadUseSimpleMenu();
    loadBatchSearchSettings();
    
    // 添加事件监听器
    const addEngineBtn = document.getElementById('addEngineBtn');
    if (addEngineBtn) {
        addEngineBtn.addEventListener('click', addEngine);
    }
    
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', resetForm);
    }
    
    const useSimpleMenuCheckbox = document.getElementById('useSimpleMenu');
    if (useSimpleMenuCheckbox) {
        useSimpleMenuCheckbox.addEventListener('change', saveUseSimpleMenu);
    }
    
    const maxBatchTabsInput = document.getElementById('maxBatchTabs');
    if (maxBatchTabsInput) {
        maxBatchTabsInput.addEventListener('change', saveBatchSearchSettings);
    }
    
    const batchSearchDelayInput = document.getElementById('batchSearchDelay');
    if (batchSearchDelayInput) {
        batchSearchDelayInput.addEventListener('change', saveBatchSearchSettings);
    }
    
    // 配置管理事件监听器
    const exportConfigBtn = document.getElementById('exportConfigBtn');
    if (exportConfigBtn) {
        exportConfigBtn.addEventListener('click', exportConfig);
    }
    
    const importConfigFile = document.getElementById('importConfigFile');
    if (importConfigFile) {
        importConfigFile.addEventListener('change', importConfig);
    }
    
    const resetConfigBtn = document.getElementById('resetConfigBtn');
    if (resetConfigBtn) {
        resetConfigBtn.addEventListener('click', resetConfig);
    }
});

// 加载搜图引擎列表
function loadEngines() {
    chrome.runtime.sendMessage({ action: 'getImageSearchEngines' }, (response) => {
        if (response && response.engines) {
            displayEngines(response.engines);
        }
    });
}

// 加载批量搜索设置
function loadBatchSearchSettings() {
    chrome.runtime.sendMessage({ action: 'getBatchSearchSettings' }, (response) => {
        if (response) {
            const maxBatchTabsInput = document.getElementById('maxBatchTabs');
            const batchSearchDelayInput = document.getElementById('batchSearchDelay');
            
            if (maxBatchTabsInput) {
                maxBatchTabsInput.value = response.maxTabs || 10;
            }
            
            if (batchSearchDelayInput) {
                batchSearchDelayInput.value = response.delay || 500;
            }
        }
    });
}

// 保存批量搜索设置
function saveBatchSearchSettings() {
    const maxBatchTabsInput = document.getElementById('maxBatchTabs');
    const batchSearchDelayInput = document.getElementById('batchSearchDelay');
    
    const maxTabs = parseInt(maxBatchTabsInput.value) || 10;
    const delay = parseInt(batchSearchDelayInput.value) || 500;
    
    // 验证输入范围
    if (maxTabs < 1 || maxTabs > 20) {
        showStatus('最大标签页数必须在1-20之间', 'error');
        maxBatchTabsInput.value = Math.max(1, Math.min(20, maxTabs));
        return;
    }
    
    if (delay < 100 || delay > 2000) {
        showStatus('打开间隔必须在100-2000毫秒之间', 'error');
        batchSearchDelayInput.value = Math.max(100, Math.min(2000, delay));
        return;
    }
    
    chrome.runtime.sendMessage({ 
        action: 'saveBatchSearchSettings',
        maxTabs: maxTabs,
        delay: delay
    }, (response) => {
        if (response?.success) {
            showStatus('批量搜索设置已更新', 'success');
        }
    });
}

// 加载简化菜单模式设置
function loadUseSimpleMenu() {
    chrome.runtime.sendMessage({ action: 'getUseSimpleMenu' }, (response) => {
        if (response) {
            const useSimpleMenuCheckbox = document.getElementById('useSimpleMenu');
            if (useSimpleMenuCheckbox) {
                useSimpleMenuCheckbox.checked = response.useSimpleMenu;
            }
        }
    });
}

// 保存简化菜单模式设置
function saveUseSimpleMenu() {
    const useSimpleMenuCheckbox = document.getElementById('useSimpleMenu');
    const useSimpleMenu = useSimpleMenuCheckbox.checked;
    
    chrome.runtime.sendMessage({ 
        action: 'saveUseSimpleMenu', 
        useSimpleMenu: useSimpleMenu 
    }, (response) => {
        if (response?.success) {
            showStatus(`已${useSimpleMenu ? '启用' : '禁用'}简化菜单模式`, 'success');
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
        <div class="engine-item ${engine.builtin ? 'builtin-engine' : 'custom-engine'}">
            <label>
                <input type="checkbox" data-engine-id="${engine.id}" class="engine-checkbox" ${engine.enabled ? 'checked' : ''}>
                <span class="engine-icon">${engine.icon || '🔗'}</span>
                <span class="engine-name" title="${escapeHtml(engine.url)}">${escapeHtml(engine.name)}</span>
                ${engine.builtin ? '<span class="builtin-badge">内置</span>' : ''}
                <button class="edit-btn" data-engine-id="${engine.id}">编辑</button>
                ${!engine.builtin ? `<button class="delete-btn" data-engine-id="${engine.id}">删除</button>` : ''}
            </label>
        </div>
    `).join('');
    
    // 为动态生成的按钮添加事件监听器
    addEngineEventListeners();
}

// 添加新的搜图引擎或更新现有引擎
function addEngine() {
    const name = document.getElementById('engineName').value.trim();
    const url = document.getElementById('engineUrl').value.trim();
    const icon = document.getElementById('engineIcon').value.trim();
    const addBtn = document.getElementById('addEngineBtn');
    const editingId = addBtn.dataset.editingId;
    
    if (!name || !url) {
        showStatus('请填写搜图引擎名称和链接', 'error');
        return;
    }
    
    if (!url.includes('%s')) {
        showStatus('搜图链接必须包含 %s 占位符', 'error');
        return;
    }
    
    // 获取现有引擎列表
    chrome.runtime.sendMessage({ action: 'getImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        
        if (editingId) {
            // 更新现有引擎
            const engine = engines.find(e => e.id === editingId);
            if (engine) {
                engine.name = name;
                engine.url = url;
                engine.icon = icon || engine.icon || '🔗';
            }
        } else {
            // 创建新引擎
            const newEngine = {
                id: Date.now().toString(),
                name: name,
                url: url,
                icon: icon || '🔗',
                enabled: true,
                builtin: false
            };
            engines.push(newEngine);
        }
        
        // 保存到storage
        chrome.runtime.sendMessage({ 
            action: 'saveImageSearchEngines', 
            engines: engines 
        }, (response) => {
            if (response?.success) {
                showStatus(editingId ? '搜图引擎更新成功' : '搜图引擎添加成功', 'success');
                resetForm();
                loadEngines(); // 重新加载列表
            } else {
                showStatus(editingId ? '更新失败，请重试' : '添加失败，请重试', 'error');
            }
        });
    });
}

// 重置表单
function resetForm() {
    document.getElementById('engineName').value = '';
    document.getElementById('engineUrl').value = '';
    document.getElementById('engineIcon').value = '';
    const addBtn = document.getElementById('addEngineBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    addBtn.textContent = '添加搜图引擎';
    cancelBtn.style.display = 'none';
    delete addBtn.dataset.editingId;
}

// 切换搜图引擎启用状态
function toggleEngine(id, enabled) {
    chrome.runtime.sendMessage({ action: 'getImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        const engine = engines.find(e => e.id === id);
        
        if (engine) {
            engine.enabled = enabled;
            
            chrome.runtime.sendMessage({ 
                action: 'saveImageSearchEngines', 
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

// 编辑搜图引擎
function editEngine(id) {
    chrome.runtime.sendMessage({ action: 'getImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        const engine = engines.find(e => e.id === id);
        
        if (engine) {
            // 填充表单
            document.getElementById('engineName').value = engine.name;
            document.getElementById('engineUrl').value = engine.url;
            document.getElementById('engineIcon').value = engine.icon || '';
            
            // 显示更新按钮和取消按钮
            const addBtn = document.getElementById('addEngineBtn');
            const cancelBtn = document.getElementById('cancelEditBtn');
            addBtn.textContent = '更新引擎';
            addBtn.dataset.editingId = id;
            cancelBtn.style.display = 'inline-block';
            
            showStatus('请修改引擎信息后点击更新', 'success');
        }
    });
}

// 删除搜图引擎
function deleteEngine(id) {
    if (!confirm('确定要删除这个搜图引擎吗？')) {
        return;
    }
    
    chrome.runtime.sendMessage({ action: 'getImageSearchEngines' }, (response) => {
        const engines = response?.engines || [];
        const filteredEngines = engines.filter(e => e.id !== id);
        
        chrome.runtime.sendMessage({ 
            action: 'saveImageSearchEngines', 
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
    // 为复选框添加事件监听器
    const checkboxes = document.querySelectorAll('.engine-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const engineId = this.dataset.engineId;
            const enabled = this.checked;
            toggleEngine(engineId, enabled);
        });
    });
    
    // 为编辑按钮添加事件监听器
    const editBtns = document.querySelectorAll('.edit-btn');
    editBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const engineId = this.dataset.engineId;
            editEngine(engineId);
        });
    });
    
    // 为删除按钮添加事件监听器
    const deleteBtns = document.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const engineId = this.dataset.engineId;
            deleteEngine(engineId);
        });
    });
}

// 导出配置
function exportConfig() {
    // 获取所有相关配置
    chrome.storage.local.get([
        'imageSearchEngines', 
        'useSimpleMenu', 
        'batchSearchDelay', 
        'maxBatchTabs'
    ], (result) => {
        const config = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            settings: {
                imageSearchEngines: result.imageSearchEngines || [],
                useSimpleMenu: result.useSimpleMenu || false,
                batchSearchDelay: result.batchSearchDelay || 500,
                maxBatchTabs: result.maxBatchTabs || 10
            }
        };
        
        // 创建下载链接
        const configJson = JSON.stringify(config, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `右键增强-配置-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('配置已导出到文件', 'success');
    });
}

// 导入配置
function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            
            // 验证配置格式
            if (!config.version || !config.settings) {
                throw new Error('配置文件格式不正确');
            }
            
            // 验证必要字段
            if (!Array.isArray(config.settings.imageSearchEngines)) {
                throw new Error('引擎配置不正确');
            }
            
            // 确认导入
            const engineCount = config.settings.imageSearchEngines.length;
            if (!confirm(`确定要导入配置吗？\n\n将导入 ${engineCount} 个搜图引擎\n导入时间：${config.exportTime ? new Date(config.exportTime).toLocaleString() : '未知'}\n\n注意：这将覆盖当前所有设置！`)) {
                return;
            }
            
            // 保存配置
            chrome.storage.local.set(config.settings, () => {
                showStatus(`配置导入成功！已导入 ${engineCount} 个引擎`, 'success');
                
                // 重新加载页面数据
                loadEngines();
                loadUseSimpleMenu();
                loadBatchSearchSettings();
                
                // 清空文件输入
                event.target.value = '';
            });
            
        } catch (error) {
            showStatus(`导入失败：${error.message}`, 'error');
            console.error('Config import error:', error);
            
            // 清空文件输入
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
