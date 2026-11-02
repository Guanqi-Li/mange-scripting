import { Navigation, NavigationStack, EnvironmentValuesReader, Script, WebView, VStack, Text, Button, useState, useMemo, useEffect, fetch } from 'scripting'
import { html } from './ui'

type Message = { op: string, url?: string, referer?: string, value?: unknown }

async function handleMessage(p: Message, setReading: (value: boolean) => void) {
  try {
    if (p.op === 'load') return { value: Storage.get('mange.v1') ?? null }
    if (p.op === 'save') {
      if (!Storage.set('mange.v1', p.value)) throw new Error('本地保存失败')
      return { value: true }
    }
    if (p.op === 'reading') { setReading(Boolean(p.value)); return { value: true } }
    if (p.op === 'fetch' || p.op === 'image') {
      if (!p.url || !/^https:\/\//i.test(p.url)) throw new Error('仅支持 HTTPS 地址')
      const response = await fetch(p.url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', ...(p.referer ? { Referer: p.referer } : {}) } })
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
}

function App({ scheme }: { scheme: string }) {
  const surface = scheme === 'dark' ? '#000000' : '#F2F2F7'
  const controller = useMemo(() => new WebViewController(), [])
  const [reading, setReading] = useState(false)
  const [status, setStatus] = useState('正在启动 MANGE…')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function initialize() {
      try {
        setStatus('正在启动 MANGE…')
        timer = setTimeout(() => { if (active) setStatus('启动超时。请点重试；若仍失败，请将此提示发给开发者。') }, 15000)
        await controller.addScriptMessageHandler('mange', p => handleMessage(p as Message, setReading))
        await controller.addScriptMessageHandler('mangeStatus', (p: { error?: string }) => {
          if (active) {
            if (timer) clearTimeout(timer)
            setStatus(p.error ? `启动失败：${p.error}` : '')
          }
          return true
        })
        if (!active) return
        if (!await controller.loadHTML(html.replace('<html lang="zh-CN">', `<html lang="zh-CN" data-native-theme="${scheme}">`))) throw new Error('WebView 未能加载本地界面')
      } catch (error) {
        if (timer) clearTimeout(timer)
        if (active) setStatus(`启动失败：${String(error)}`)
      }
    }
    initialize()
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [attempt])
  useEffect(() => () => controller.dispose(), [])
  useEffect(() => {
    if (!status) controller.evaluateJavaScript(`document.documentElement.dataset.nativeTheme = ${JSON.stringify(scheme)}; return true`).catch(() => {})
  }, [scheme, status])
  const toolbar = {
    cancellationAction: <Button title="退出" systemImage="xmark" action={() => Script.exit()} />,
    primaryAction: Script.supportsMinimization() ? <Button title="最小化"
      systemImage="arrow.down.right.and.arrow.up.left"
      action={() => {
        Script.minimize().then(success => {
          if (!success) setStatus('当前环境无法最小化，请稍后重试。')
        }).catch(error => setStatus(`最小化失败：${String(error)}`))
      }} /> : undefined
  }
  return <NavigationStack background={{ style: reading ? '#000000' : surface, shape: 'rect' }}
    toolbarBackground={{ style: surface, bars: ['navigationBar'] }}
    toolbarBackgroundVisibility={{ visibility: 'visible', bars: ['navigationBar'] }}
    statusBarHidden={reading}
    persistentSystemOverlays={reading ? 'hidden' : 'visible'}>
  <VStack spacing={0} background={{ style: reading ? '#000000' : surface, shape: 'rect' }} navigationTitle="MANGE" navigationBarTitleDisplayMode="inline"
    toolbar={reading ? undefined : toolbar}
    toolbarBackground={{ style: surface, bars: ['navigationBar'] }}
    toolbarBackgroundVisibility={{ visibility: 'visible', bars: ['navigationBar'] }}
    toolbarVisibility={{ visibility: reading ? 'hidden' : 'visible', bars: ['navigationBar'] }}
    statusBarHidden={reading}
    persistentSystemOverlays={reading ? 'hidden' : 'visible'}
    ignoresSafeArea={reading}>
    {status ? <VStack padding={16}>
      <Text>{status}</Text>
      <Button title="重试启动" action={() => setAttempt(attempt + 1)} />
    </VStack> : null}
    <WebView controller={controller} background={reading ? '#000000' : surface} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} />
  </VStack>
  </NavigationStack>
}

async function main() {
  try {
    await Navigation.present({ element: <EnvironmentValuesReader keys={['colorScheme']}>
      {env => <App scheme={env.colorScheme} />}
    </EnvironmentValuesReader>, modalPresentationStyle: 'fullScreen' })
  } catch (error) {
    console.error('MANGE startup:', String(error))
    await Navigation.present({ element: <VStack padding={20}><Text>MANGE 启动失败：{String(error)}</Text></VStack> })
  } finally { Script.exit() }
}
main()
