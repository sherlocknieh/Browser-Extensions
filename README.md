## 我的浏览器扩展


|name     | description         | link |
|---      |---                  |---   |
|二维码   | [README](#二维码)   |[Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/clkjmabfjboobjkemgknlgpjjlhdghbp)|
|右键增强 | [README](#右键增强) |[Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/ingokbdobdmjedneflejcdidkkafciic)|

-------------------------------------------

## 二维码

### 功能

#### 生成

  - [x] 为当前页面生成二维码
  - [x] 为选中文字生成二维码
  - [x] 为链接生成二维码

#### 识别

  - [x] 右键识别图片中的二维码
  - [x] 支持浏览器打开的本地图片
  - [x] 截屏识别二维码
  - [ ] PDF文件识别二维码

#### 其它

  - [x] 多语言支持

### 用到的第三方库

  - 使用 jsQR 库做识别
  - 使用 qrcode.js 库做二维码生成
  - 使用 SweetAlert2 库做通知弹窗
  - 使用 js-screen-shot 库做截图


-------------------------------------------

## 右键增强

### 功能

- 右键
  - [x] 右键复制链接文字
  - [x] 右键搜索图片
- 设置
  - [x] 自定义添加搜索引擎
  - [x] 拖拽排序搜索引擎
  - [x] 配置持久化
  - [x] 配置导入导出
- 其它
  - [ ] 多语言支持

### 用到的第三方库
  - 使用 toastify 库做通知弹窗
  - 使用 sortablejs 库做拖拽排序
