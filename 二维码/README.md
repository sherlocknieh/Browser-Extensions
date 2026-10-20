# 二维码插件

生成二维码:

- 为当前网页生成二维码
- 为选中的文本生成二维码
- 为网页中的链接生成二维码

识别二维码:

- 识别网页图片中的二维码
- 粘贴图片/本地上传图片识别二维码

## Done

- [x] 支持彩色二维码, 圆点二维码, SVG 图片二维
- [x] 给 Firefox 地址栏图标添加右键菜单
- [x] 优化截图识别的体验

## TODO

- [ ] 支持倾斜变形二维码识别
- [ ] 支持识别一个图片中的多个二维码

## 用到的库

- 跨浏览器开发: wxt, vue3
- 二维码识别: jsQR
- 二维码生成: qrcode-generator
- 弹窗提示: 自研通知组件
- 网页截图: 自研截图组件

# 发布

使用 `wxt submit` 自动向商店提交新版本。

```bash
# 配置密钥
pnpm wxt submit init

# 构建并提交到单个商店
pnpm submit:chrome
pnpm submit:edge
pnpm submit:firefox

# 一次提交三个商店
pnpm submit

# 仅测试密钥
pnpm submit:chrome --dry-run
pnpm submit --dry-run
```

> `wxt submit` 需要显式传入要上传的 ZIP 文件，否则会报
> `No ZIP files detected to upload`。`submit*` 脚本统一走
> `scripts/submit.mjs`：先清理 `.output` 里的旧包，再构建 ZIP，
> 最后把解析出的绝对路径传给 `wxt submit`。
>
> 这样在 Windows 下也能用（不依赖 `rm`、`VAR=值` 语法和 shell 通配符），
> 脚本还会自动设置 `NODE_USE_ENV_PROXY=1`，让 Node 的 `fetch` 走 `https_proxy`。
