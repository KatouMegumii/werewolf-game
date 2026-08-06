import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['langrensha.jxjhlrs.fun'],
    // 允许 dev 服务器读取仓库根的 shared/ 共享模块(座位数计算唯一实现)
    fs: { allow: ['..'] }
  }
})
