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
        Swal.fire({
            icon: 'error',
            title: '图片获取失败',
            text: error.message,
            confirmButtonText: '确定'
        });
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
        const toast = Swal.fire({
            title: '正在获取图片数据...',
            text: '跨域图片，数据获取可能略慢',
            icon: 'info',
            toast: true,
            position: 'bottom-end',
            showConfirmButton: false,
            timerProgressBar: true,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        return toast;
    }
    
    // 辅助函数：隐藏加载提示
    function hideLoadingMessage(toast) {
        if (toast) {
            toast.close();
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
        
        Swal.fire({
            title: '二维码解析成功',
            text: result,
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: '打开链接',
            cancelButtonText: '取消',
            input: 'url',
            inputValue: result,
            inputLabel: '链接地址：',
            showLoaderOnConfirm: true,
            preConfirm: (url) => {
                if (!url) {
                    Swal.showValidationMessage('请输入有效的链接地址');
                    return false;
                }
                
                let urlToOpen = url;
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    urlToOpen = 'https://' + url;
                }
                
                try {
                    new URL(urlToOpen);
                    return urlToOpen;
                } catch {
                    Swal.showValidationMessage('链接格式不正确');
                    return false;
                }
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                window.open(result.value, '_blank');
            }
        });
    } else {
        Swal.fire({
            icon: 'warning',
            title: '未发现二维码',
            text: '请尝试选择包含二维码的图片',
            confirmButtonText: '确定'
        });
    }
}
