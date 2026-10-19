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

## TODO

- [ ] 支持倾斜变形二维码识别
- [ ] 支持识别一个图片中的多个二维码
- [ ] 优化截图识别的体验

## 用到的库

- 跨浏览器开发: wxt, vue3
- 二维码识别: jsQR
- 二维码生成: qrcode-generator
- 网页截图: js-web-screen-shot
- 弹窗提示: sweetalert2

# 发布

使用 `wxt submit` 自动向商店提交新版本。

```bash
# 配置密钥
pnpm wxt submit init
# 测试密钥
pnpm wxt submit --dry-run
# 提交新版本
pnpm wxt submit
```
