import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        node1: resolve(__dirname, 'node1.html'),
        node2: resolve(__dirname, 'node2.html'),
        node3: resolve(__dirname, 'node3.html'),
        node4: resolve(__dirname, 'node4.html'),
        node5: resolve(__dirname, 'node5.html'),
        node6: resolve(__dirname, 'node6.html'),
        node7: resolve(__dirname, 'node7.html'),
        node8: resolve(__dirname, 'node8.html'),
        node9: resolve(__dirname, 'node9.html'),
        node10: resolve(__dirname, 'node10.html'),
      }
    }
  }
})