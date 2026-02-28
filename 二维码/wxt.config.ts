// wxt.config.ts
import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

// 确保 dev profile 目录存在（不存在会自动创建）
import { mkdirSync } from 'node:fs';
mkdirSync('.wxt/dev-profile/chrome', { recursive: true });
mkdirSync('.wxt/dev-profile/firefox', { recursive: true });

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'], // 使用 Vue 模块
  srcDir: 'src',                    // 自定义源码目录
  webExt: {
    // disabled: true,              // 调试时不自动打开浏览器
    startUrls: ['https://inftab.com/'],         // 调试时自动打开的页面
    chromiumProfile: resolve('.wxt/dev-profile/chrome'), // 调试时使用的 Chromium 配置文件路径
    firefoxProfile: resolve('.wxt/dev-profile/firefox'), // 调试时使用的 Firefox 配置文件路径
    keepProfileChanges: true,               // 记忆浏览器配置变更
    // 以上三行配置防止每次调试都打开全新无配置的浏览器
  },
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    author: 'sherlocknieh@gmail.com' as unknown as { email: string },
    homepage_url: 'https://github.com/sherlocknieh/Browser-Extensions',
    permissions: [
      'contextMenus',  // 右键菜单权限
      'menus',         // Firefox 兼容：等价于 contextMenus
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
