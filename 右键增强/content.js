// 全局变量存储最后右键点击的链接元素
let lastRightClickedLink = null;

// 监听右键点击事件，记录被点击的链接
document.addEventListener('contextmenu', (event) => {
    let target = event.target;
    // 向上查找链接元素
    while (target && target !== document) {
        if (target.tagName === 'A' && target.href) {
            lastRightClickedLink = target;
            break;
        }
        target = target.parentElement;
    }
});

// 监听来自 background.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "Toast") {
        showToast(message.text || "消息为空", message.icon || "success");
    } else if (message.action === "copyLinkText") {
        // 处理复制链接文字请求
        copyLinkText(message.linkText, message.linkUrl, message.selectionText);
    }
});


// 显示 Toast 提示
function showToast(text, icon = 'success') {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: icon,
        title: text,
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}

// 复制链接文字函数
function copyLinkText(linkText, linkUrl, selectionText) {
    // 专注于获取链接的显示文本，优先级：选中文本 > 链接显示文字 > 从DOM获取文字
    let textToCopy = '';
    let copyType = '';
    
    if (selectionText && selectionText.trim()) {
        textToCopy = selectionText.trim();
        copyType = '选中文本';
    } else if (linkText && linkText.trim()) {
        textToCopy = linkText.trim();
        copyType = '链接文字';
    } else {
        // 从右键点击的链接元素中获取显示文本
        const clickedLink = getClickedLinkElement();
        if (clickedLink) {
            const extractedText = getLinkDisplayText(clickedLink);
            if (extractedText && extractedText !== linkUrl) {
                textToCopy = extractedText;
                copyType = '链接文字';
            }
        }
    }
    
    if (!textToCopy) {
        showToast('该链接没有可复制的显示文字', 'warning');
        return;
    }

    // 使用现代的 clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                const displayText = textToCopy.length > 30 ? textToCopy.substring(0, 30) + '...' : textToCopy;
                showToast(`已复制${copyType}: ${displayText}`, 'success');
            })
            .catch(err => {
                console.error('复制失败:', err);
                // 降级到传统方法
                fallbackCopyText(textToCopy, copyType);
            });
    } else {
        // 浏览器不支持 clipboard API，使用降级方案
        fallbackCopyText(textToCopy, copyType);
    }
}

// 获取被右键点击的链接元素
function getClickedLinkElement() {
    // 优先返回记录的最后右键点击的链接
    if (lastRightClickedLink) {
        return lastRightClickedLink;
    }
    
    // 检查当前激活的元素
    const activeElement = document.activeElement;
    if (activeElement && activeElement.tagName === 'A') {
        return activeElement;
    }
    
    return null;
}

// 从链接元素获取显示文本内容（不包含URL）
function getLinkDisplayText(linkElement) {
    // 优先获取文本内容
    let text = linkElement.textContent?.trim();
    
    if (text && text !== linkElement.href) {
        return text;
    }
    
    // 如果没有文本内容或文本就是URL，检查是否有 aria-label
    text = linkElement.getAttribute('aria-label');
    if (text && text !== linkElement.href) {
        return text;
    }
    
    // 检查 title 属性
    text = linkElement.getAttribute('title');
    if (text && text !== linkElement.href) {
        return text;
    }
    
    // 如果是图片链接，获取图片的 alt 文本
    const img = linkElement.querySelector('img');
    if (img && img.alt && img.alt !== linkElement.href) {
        return img.alt;
    }
    
    // 检查是否有其他子元素的文本
    const textElements = linkElement.querySelectorAll('span, div, p, strong, em, b, i');
    for (const elem of textElements) {
        const elemText = elem.textContent?.trim();
        if (elemText && elemText !== linkElement.href) {
            return elemText;
        }
    }
    
    // 如果都没找到有意义的显示文本，返回 null
    return null;
}

// 降级复制方案
function fallbackCopyText(text, copyType = '文本') {
    try {
        // 创建临时 textarea 元素
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        
        textarea.select();
        textarea.setSelectionRange(0, 99999); // 兼容移动设备
        
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (success) {
            showToast(`已复制${copyType}: ${text.length > 30 ? text.substring(0, 30) + '...' : text}`, 'success');
        } else {
            showToast('复制失败，请手动复制', 'error');
        }
    } catch (err) {
        console.error('降级复制方案也失败:', err);
        showToast('复制功能不可用', 'error');
    }
}

