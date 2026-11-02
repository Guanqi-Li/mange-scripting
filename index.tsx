import { Navigation, Script, Storage, WebView, useState } from 'scripting'
import { html } from './ui'

const controller = new WebViewController()
let setReading: (value: boolean) => void = () => {}
function App() {
  const [reading, update] = useState(false)
  setReading = update
  return <WebView controller={controller} statusBarHidden={reading}
    persistentSystemOverlays={reading ? 'hidden' : 'visible'}
    ignoresSafeArea={reading ? true : false} />
}
await controller.addScriptMessageHandler('mange', async (p: {op: string, url?: string, referer?: string, value?: unknown}) => {
  try {
    if (p.op === 'load') return { value: Storage.get('mange.v1') ?? null }
    if (p.op === 'save') {
      if (!Storage.set('mange.v1', p.value)) throw new Error('本地保存失败')
      return { value: true }
    }
    if (p.op === 'reading') { setReading(Boolean(p.value)); return { value: true } }
    if (p.op === 'fetch' || p.op === 'image') {
      if (!p.url || !/^https:\/\//i.test(p.url)) throw new Error('仅支持 HTTPS 地址')
      const response = await fetch(p.url, { headers: p.referer ? { Referer: p.referer } : {} })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (p.op === 'image') {
        const data = await response.data()
        if (data.size > 25 * 1024 * 1024) throw new Error('图片超过 25 MB')
        const mime = (response.headers.get('content-type') || 'image/jpeg').split(';')[0]
        if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(mime)) throw new Error('不支持的图片类型')
        return { value: `data:${mime};base64,${data.toBase64String()}` }
      }
      return { value: await response.text() }
    }
    throw new Error('未知操作')
  } catch (error) { return { error: String(error) } }
})
try {
  if (!await controller.loadHTML(html, 'https://mange.local/')) throw new Error('界面加载失败')
  await Navigation.present({ element: <App />, modalPresentationStyle: 'fullScreen' })
} finally { controller.dispose(); Script.exit() }
