// 监听来自 background.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理二维码识别请求
    if (message.action === "decodeQR" && message.imageUrl) {
        QRCodeReader(message.imageUrl);
        // 这里传入的图片URL是完整链接
    }
});


// 二维码识别流程
function QRCodeReader(imageUrl) {

    LoadImage(imageUrl)             // 获取图片数据
    .then(imageData => {
        setTimeout(() => {
            decodeQRCode(imageData);    // 解析二维码
        }, 100); // 给 DOM 更新留出时间
    })
    .catch(error => {
        alert("图片数据获取失败: " + error.message);
    });
}


// 图片数据加载函数
async function LoadImage(imageUrl) {
    // 检查是否跨域（本地文件 file: 链接视为跨域）
    if (!imageUrl.startsWith('file:') && new URL(imageUrl).origin === window.location.origin) {
    // 未跨域：直接获取
        const img = document.createElement('img');
        img.src = imageUrl;
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("图片加载失败"));
        });
        return imgToData(img);
    } else {
    // 跨域：通过 background 代理
        return new Promise((resolve, reject) => {
            const loadingMsg = showLoadingMessage();      // 显示加载中提示
            // 向 background 发起消息
            chrome.runtime.sendMessage({action: "fetchImage", url: imageUrl}, (response) => {
                hideLoadingMessage(loadingMsg);           // 完成后隐藏提示
                if (response && response.success) {
                    const img = new Image();
                    img.onload = () => resolve(imgToData(img));
                    img.onerror = () => reject(new Error("图片加载失败"));
                    img.src = response.dataUrl;
                } else {
                    reject(new Error(response?.error || "代理获取失败"));
                }
            });
        });
    }
    
    // 辅助函数：显示加载提示
    function showLoadingMessage() {
        const div = document.createElement('div');
        div.id = 'qr-loading-msg';
        div.style.cssText = `
            position: fixed; bottom: 10%; right: 10%; transform: translate(+50%, +50%);
            z-index:50; background: yellow; font-size: 14px; padding: 1em; border-radius: 5px; 
        `;
        div.innerHTML = `
            <span style="display: inline-block; margin-right: 8px; animation: spin 1s linear infinite;">⟳</span>
            跨域图片, 数据获取可能略慢
        `;
        
        // 添加旋转动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(div);
        return { div, style };
    }
    
    // 辅助函数：隐藏加载提示
    function hideLoadingMessage(elements) {
        if (elements && elements.div && elements.div.parentNode) {
            elements.div.parentNode.removeChild(elements.div);
        }
        if (elements && elements.style && elements.style.parentNode) {
            elements.style.parentNode.removeChild(elements.style);
        }
    }
    
    // 辅助函数：从图片元素获取图片数据
    function imgToData(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
}


// 二维码解析函数
function decodeQRCode(imageData) {

    // 解析二维码
    let code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth"    // 支持反转色
    });
    
    if (code) {
        const result = code.data;
        const userInput = prompt("解析成功, 是否打开链接?", result);
        
        if (userInput !== null) {
            let urlToOpen = result;
            if (!result.startsWith('http://') && !result.startsWith('https://')) {
                urlToOpen = 'https://' + result;
            }
            window.open(urlToOpen, '_blank'); // 在新标签页中打开
        }
    } else {
        alert("未发现二维码");
    }
}
