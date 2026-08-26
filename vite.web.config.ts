import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { allowViteDevelopmentStyles } from './src/build/web-development-csp'

const developmentCspPlugin: Plugin = {
  name: 'mqttape-web-development-csp',
  apply: 'serve',
  enforce: 'pre',
  transformIndexHtml: allowViteDevelopmentStyles
}

const webPageTitlePlugin: Plugin = {
  name: 'mqttape-web-page-title',
  transformIndexHtml(html) {
    return html.replace(
      '<title>MQTTape</title>',
      '<title>MQTTape — MQTT 流量擷取、封包檢視與重播</title>'
    )
  }
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [webPageTitlePlugin, developmentCspPlugin, react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'protobuf-vendor': ['protobufjs'],
          'cbor-vendor': ['cbor-x']
        }
      }
    }
  }
})
