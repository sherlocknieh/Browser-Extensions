
// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理二维码识别请求
    if (message.action === "decodeQR" && message.imageUrl) {
        decodeQRCode(message.imageUrl);
    }
});


// 二维码解析函数
function decodeQRCode(imageUrl) {
    console.log("开始解析二维码:", imageUrl);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {
        try {
            // 创建canvas来绘制图片
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 设置canvas大小并绘制图片
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0, img.width, img.height);

            // 确保jsQR库已加载
            if (typeof jsQR === "function") {
                // 获取图像数据并解析二维码
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && code.data) {
                    // 解析成功
                    console.log("二维码解析成功:", code.data);
                    chrome.storage.local.set({ qrResult: code.data });

                    // 使用prompt显示结果，方便用户复制
                    const result = code.data;
                    const userInput = prompt("二维码解析成功！\n\n点击“确定”将在新标签页打开链接（如果是网址）\n点击“取消”则只显示内容", result);

                    // 如果用户点击了确定且内容是URL，在新标签页打开
                    if (userInput !== null && isValidURL(result)) {
                        let urlToOpen = result;
                        // 如果URL没有协议，自动添加https://
                        if (!result.startsWith('http://') && !result.startsWith('https://')) {
                            urlToOpen = 'https://' + result;
                        }
                        window.open(urlToOpen, '_blank');
                    }
                } else {
                    // 解析失败
                    console.log("未能识别二维码");
                    prompt("未能识别到二维码\n\n请确保图片包含清晰的二维码", "试试重新刷新页面后再试");
                }
            } else {
                console.error("jsQR库未加载");
                prompt("jsQR库未加载\n\n无法解析二维码", "请刷新页面后重试");
            }
        } catch (error) {
            console.error("二维码解析错误:", error);
            prompt("解析二维码时发生错误", error.message);
        }
    };

    img.onerror = function () {
        console.error("图片加载失败");
        prompt("无法加载图片", "请检查图片URL是否有效");
    };

    // 设置图片源开始加载
    img.src = imageUrl;
}


// URL验证函数
function isValidURL(text) {
    try {
        const url = new URL(text);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        // 检查是否为常见的URL模式（不以协议开头）
        return /^(www\.)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/.test(text);
    }
}
