# 二维码 (WXT + Vue3)

要用 Edge 浏览器调试 Chrome 扩展, 只需创建 .env 文件, 设置以下环境变量：
```
# linux
CHROME_PATH=/usr/bin/microsoft-edge
# windows
# CHROME_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

## 第三方库依赖：

- 二维码识别: jsqr
- 二维码生成: qrcode-generator
- 网页截图: js-web-screen-shot
- 弹窗提示: sweetalert2

WXT 项目必须文件
- wxt.config.ts
- tsconfig.json
- package.json
- .wxt/ : pnpm install 后自动生成
- public/ : 静态资源目录, 存放图标, 多语言文件等
- src/ : 项目源码目录
    - entrypoints/ : 入口文件目录
        - background.js : 后台脚本入口文件
        - content.js : 内容脚本入口文件