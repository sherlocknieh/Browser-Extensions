import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'], // 使用 Vue 模块
  vite: () => ({
    plugins: [tailwindcss()],       // 使用 Tailwind CSS
  }),
  srcDir: 'src',                    // 自定义源码目录
  webExt: {
    startUrls: ['https://immersivetranslate.com/zh-Hans/mobile'], // 调试时自动打开的页面
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-profile'],  // 记忆 Chromium 调试时的浏览器配置
    firefoxArgs: ['-profile', './.wxt/firefox-profile'],      // 记忆 Firefox 调试时的浏览器配置
    // disabled: true,              // 调试时不自动打开浏览器
  },
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    author: 'sherlocknieh@gmail.com' as unknown as { email: string },
    homepage_url: 'https://github.com/sherlocknieh/Browser-Extensions',
    permissions: [
      'contextMenus',  // 右键菜单权限
      'storage',       // 本地存储权限；选中文本生成二维码时需要此权限
      'activeTab',     // 当前标签页信息权限；获取页面URL, 读取网页图片等
    ],
    host_permissions: ['file:///*'], // 允许访问本地文件(用于识别浏览器打开的本地图片)
    icons: {
      16: 'icon.png',   // 工具栏,右键菜单,标签favicon
      32: 'icon.png',   // Firefox 工具栏和 about:addons 管理页面
      48: 'icon.png',   // chrome://extensions 管理页面
      128: 'icon.png',  // 扩展商店
    },
    page_action: {        // Firefox MV2 兼容设置，为了实现把图标显示在地址栏
      default_icon: {
        19: '/icon.png',
        38: '/icon.png',
      },
      default_title: 'QRCode',
      default_popup: '/popup/index.html',
    },
  },
});
