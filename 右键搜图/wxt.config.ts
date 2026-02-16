import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// 确保 dev profile 目录存在（不存在会自动创建）
import { mkdirSync } from 'node:fs';
mkdirSync('.wxt/chrome-profile', { recursive: true });
mkdirSync('.wxt/firefox-profile', { recursive: true });

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'], // 使用 Vue 模块
  vite: () => ({
    plugins: [tailwindcss()],       // 使用 Tailwind CSS
  }),
  srcDir: 'src',                    // 自定义源码目录
  webExt: {
    // disabled: true,              // 调试时不自动打开浏览器
    // startUrls: ['https://immersivetranslate.com/zh-Hans/mobile'], // 调试时自动打开的页面
    chromiumProfile: '.wxt/chrome-profile', // 调试时使用的 Chromium 配置文件路径
    firefoxProfile: '.wxt/firefox-profile', // 调试时使用的 Firefox 配置文件路径
    keepProfileChanges: true,               // 记忆浏览器配置变更
    // 以上三行配置防止每次调试都打开全新无配置的浏览器
  },
  manifest: {
    name: '右键搜图',
    description: '在图片上右键使用自定义搜图引擎搜索图片',
    author: 'sherlocknieh@gmail.com' as unknown as { email: string },
    homepage_url: 'https://github.com/sherlocknieh/Browser-Extensions',
    permissions: [
      'contextMenus',  // 右键菜单权限
      'menus',         // Firefox 兼容：等价于 contextMenus
      'storage',       // 本地存储权限；保存用户配置
      'activeTab',     // 当前标签页信息权限；获取页面URL, 读取网页图片等
      'downloads',     // 下载文件权限；保存配置文件
    ],
    icons: {
      16: 'icon.png',   // 工具栏,右键菜单,标签favicon
      32: 'icon.png',   // Firefox 工具栏和 about:addons 管理页面
      48: 'icon.png',   // chrome://extensions 管理页面
      128: 'icon.png',  // 扩展商店
    },
  },
});
