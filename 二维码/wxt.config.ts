// wxt.config.ts
import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

// 确保 dev profile 目录存在
import { mkdirSync } from 'node:fs';
mkdirSync('.wxt/dev-profile/chrome', { recursive: true });
mkdirSync('.wxt/dev-profile/firefox', { recursive: true });

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'], // 使用 Vue 模块
  srcDir: 'src',                    // 自定义源码目录
  webExt: {
    keepProfileChanges: true,       // 记忆浏览器配置变更, 防止每次调试都打开全新无配置的浏览器
    chromiumProfile: resolve('.wxt/dev-profile/chrome'), // 调试时 Chromium 配置文件路径
    firefoxProfile: resolve('.wxt/dev-profile/firefox'), // 调试时 Firefox 配置文件路径
    // 调试时自动打开的页面
    startUrls: [
      'about:newtab',
      'https://inftab.com/',
      'https://en.wikipedia.org/wiki/QR_code',
    ],
  },
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    author: 'sherlocknieh@gmail.com' as unknown as { email: string },
    homepage_url: 'https://github.com/sherlocknieh/Browser-Extensions',
    host_permissions: ['file:///*'], // 允许访问本地文件
    permissions: [
      'contextMenus',  // 右键菜单权限
      'storage',       // 本地存储权限
      'tabs',          // 所有标签元数据权限
      'activeTab',     // 前台标签页内容权限
    ],
    icons: {
      16: 'icon/16.png',   // 工具栏,右键菜单,标签栏图标
      32: 'icon/32.png',   // Firefox 工具栏和扩展管理页面
      48: 'icon/48.png',   // Chrome 扩展管理页面
      128: 'icon/128.png', // 扩展商店页面
    },
    // Firefox 上传要求填写的项目
    browser_specific_settings: {
      gecko: {
        id: "qrcode@sherlocknieh.github.io",
        data_collection_permissions:{
          required: ['none']
        }
      },
    },
    // Firefox 地址栏按钮
    page_action: {
      default_icon: {
        19: 'icon/19.png',
        38: 'icon/38.png',
      },
      default_title: 'QRCode',
      default_popup: '/popup.html',
    },
  },
});