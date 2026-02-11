import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'], // 使用 Vue 模块
  srcDir: 'src',                    // 自定义源码目录
  //webExt: { disabled: true },     // 调试时不自动打开浏览器
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    author: 'sherlocknieh@gmail.com' as unknown as { email: string },
    homepage_url: 'https://github.com/sherlocknieh/Browser-Extensions',
    permissions: [
      'contextMenus',  // 允许使用右键菜单
      'storage',       // 允许使用本地存储，选中文本生成二维码时需要此权限
      'activeTab',     // 允许访问当前标签页的信息，跨域访问图片需要此权限
      'scripting'      // 允许使用脚本注入权限
    ],
    host_permissions: ['file:///*'], // 允许访问本地文件(用于识别浏览器打开的本地图片)
    icons: {
      16: 'icon.png',
      32: 'icon.png',
      48: 'icon.png',
      128: 'icon.png',
    },
  },
});
