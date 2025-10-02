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
        decodeQRCode(imageData);    // 解析二维码
    })
    .catch(error => {
        Swal.fire({
            icon: 'error',
            title: '图片获取失败',
            text: error.message,
        });                         // 显示错误信息
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
    // 跨域：通过 background 代理获取
        const loadingToast = Swal.fire({
            icon: 'info',
            title: '正在获取图片数据...',
            text: '跨域图片，数据获取可能略慢',
            didOpen: () => {Swal.showLoading();}
        });
        return new Promise((resolve, reject) => {
            // 向 background 发起消息
            chrome.runtime.sendMessage({action: "fetchImage", url: imageUrl}, (response) => {
                if (response && response.success) {
                    const img = new Image();
                    img.onload = () => resolve(imgToData(img));
                    img.onerror = () => reject(new Error("图片加载失败"));
                    img.src = response.dataUrl;
                } else {
                    reject(new Error(response?.error || "代理获取失败"));
                }
                loadingToast.close();
            });
        });
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
async function decodeQRCode(imageData) {

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth"});   // 支持反转色

    if (code) {
        const result = code.data;
        Swal.fire({
            icon: 'success',
            title: '识别成功',
            text: result,
            showCancelButton: true,
            confirmButtonText: '打开链接',
            cancelButtonText: '复制链接'
        }).then((res) => {
            if (res.isConfirmed) {
                const url = result.startsWith('http') ? result : 'https://' + result;
                window.open(url, '_blank');
            } else if (res.dismiss === Swal.DismissReason.cancel) {
                navigator.clipboard.writeText(result);
            }
        });
    } else {
        Swal.fire({
            icon: 'warning',
            title: '识别失败',
            text: '未发现有效二维码',
            confirmButtonText: '确定'
        });
    }
}
