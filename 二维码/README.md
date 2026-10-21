# 二维码 - 浏览器插件

极简主义 + 全功能 + 全平台二维码插件


| [Chrome](https://chromewebstore.google.com/detail/qrcode/hflmenbgannghieoagnegjlbmlnllkhc) | [Edge](https://microsoftedge.microsoft.com/addons/detail/clkjmabfjboobjkemgknlgpjjlhdghbp) | [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/qrcode-simple/) |
| --- | --- | --- |

## 功能:

**1. 二维码生成:**

  - 当前页面地址二维码: 点击插件工具栏图标
  - 选中文本生成二维码: 在选中文本上右键
  - 网页链接生成二维码: 在网页链接上右键

**2. 二维码识别:**

  - 网页图片二维码识别: 在图片上点击右键选择识别方式
  - 截图识别二维码: 工具栏图标上点击右键进行截图识别

## TODO:

- 功能优化:
  - [ ] 支持截图标注和保存 (可作为完整的截图工具使用)
  - [ ] 支持识别一张图片中的多个二维码
  - [ ] 易拉罐曲面上的二维码识别 (可选的库: quirc-mesh/pqrs-js/opencv-qr)
  - [x] 浏览器打开的 PDF 文件中的二维码识别
  - [x] 支持倾斜变形二维码识别
  - [x] 支持彩色二维码, 圆点二维码, SVG 二维码
  - [x] 支持识别一维条形码, 支持旋转 90 度的竖排条形码

- 交互优化: 
  - [x] 优化菜单文字和通知文字
  - [x] 优化 PDF 文件二维码识别流程 (右键工具栏图标直接在页面上框选, 无法注入时改为新标签页框选; 左键保持默认生成地址二维码)
  - [x] 给截图容器添加入场动画
  - [x] 支持用户自行关闭/打开地址栏图标
  - [x] 扫描到条形码时, 通知标题写: 条形码扫描成功
  - [x] 优化 Firefox 地址栏图标右键功能
  - [x] 优化截图识别的体验
  - [x] 页面通知统一用 popup 展示

- 性能优化:
  - [x] 跨域图片识别优化: 加载时可新标签打开图片或改用截图识别
  - [x] 条形码识别优化: 优先扫描条形码, 失败再作为二维码扫描

- 错误修复:
  - [x] 修复 Firefox 打开本地图片时无法读取图片的问题
  - [x] SVG 页面扫描结果通知的关闭按钮同时关闭 popup，避免留下空白窗口

## 用到的库

- 跨浏览器开发: wxt + vue3
- 二维码生成: qrcode-generator
- 二维码识别: ~~jsQR~~ (换为 zxing-js, 识别率更高且支持条形码)
- 网页截图: ~~js-web-screen-shot~~ 本地重写的截图组件
- 弹窗通知: ~~SweetAlert2~~ 本地重写的通知组件
