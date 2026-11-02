# MANGE · Scripting

将原 Android Mange 的漫画阅读流程迁移到 iPhone / iPad 的 Scripting App。入口为 TypeScript TSX，界面使用内嵌 WebView，数据保存在 Scripting Storage。

## 在 Scripting 中导入

在「导入远程脚本」中粘贴专用 ZIP 的直链：

https://raw.githubusercontent.com/Guanqi-Li/mange-scripting/main/dist/MANGE.zip

也可使用仓库地址：https://github.com/Guanqi-Li/mange-scripting

本仓库根目录和 ZIP 根目录均含 `script.json`，入口为 `index.tsx`。ZIP 仅含运行所需的 `script.json`、`index.tsx`、`ui.ts`，不含开发工具或外层文件夹。若已有手工创建的旧项目，请先保留它的数据，再导入新版。

导入后运行 MANGE；首次按 Scripting 提示允许网络访问。`ui.ts` 已包含默认瓜子漫画源，不需要 npm 或服务器。搜索漫画，点开结果后加入书架或选章节。下次点书架会继续阅读。

导入源接受 GitHub blob 文件链接（常规分支名）及 Raw HTTPS JSON 链接；私有源仓库认证暂不支持。用户数据不会上传到 GitHub，Android 旧版阅读进度不会自动迁移。

## 1.0.4 统一底色

导航栏明确使用 systemGroupedBackground，并固定显示该背景；原生容器、WebView 和网页主体同步使用系统分组底色。浅色为 #f2f2f7，深色为黑色；阅读区保持黑色。

## 1.0.3 窗口控制与 iOS 样式

参照 JM 使用原生 NavigationStack 工具栏：左侧退出，右侧最小化；最小化调用 Script.minimize，保留运行实例。主界面使用系统导航栏与 SF Symbols，网页内容调整为系统分组底色、蓝色主操作、胶囊控件、圆角列表，跟随系统明暗模式。阅读时隐藏原生导航栏，返回主界面后恢复退出与最小化按钮。最小化按钮仅在宿主支持时显示，失败显示提示。

## 1.0.2 启动流程修复

使用显式 async main 入口；先展示原生界面，再在挂载后加载 WebView。增加启动完成握手、超时提示、错误文字和重试入口，避免失败时只显示白屏。手机端实际原因需结合报错进一步确认。

## 1.0.1 导入修复

补齐 Scripting `script.json` 元数据，生成与参考脚本相同根目录结构的专用 ZIP；原生宿主的 Storage 和 Script 使用全局 API，fetch 使用 Scripting 导出。此前仅改仓库可见性不足以修复缺失元数据造成的导入问题。

## 功能

- 顶部仅 MANGE，搜索框回车搜索，当前源和导入源在下一行。
- 搜索名称和封面、漫画详情、章节目录、加入书架。
- 本地保存章节、图片页码和页内比例；书架点击续读。
- 全屏阅读，轻点显示或隐藏上下操作栏，上一章、下一章、目录、模式切换。
- 目录突出当前章并定位；上下滚动接下一章，左右模式滑动切换图片，长图可上下滚动。
- 图片 1–4 倍双指缩放、放大后拖动、双击切换原始与 2 倍。
- 书架长按确认删除；源通过删除按钮确认移除，保留至少一个源。
- 图片直接加载失败时通过 Scripting 请求携带章节 Referer 重试；单图限制 25 MB。

## 开发

`index.tsx` 是 Scripting 原生宿主，`app.ts` 是浏览器中执行的 TypeScript 兼容脚本，`shell.html` 为布局。修改后运行：

```sh
python tools/build.py
```

构建生成 `ui.ts`，不需要网络。支持原 Android 项目的静态 HTML JSON 源字段（`search`、`detail`、`reader`），使用标准 CSS 选择器；属性值含斜线时必须加引号。源 JSON 不执行代码。

## 验证与限制

使用原项目的网页样本在独立无头浏览器中验证：搜索结果 2 项、目录 812 章、章节图片 18 张、书架加入、目录打开、模式切换、页码保存及重进续读、拼接下一章与跨章进度。测试替换了网络和 Scripting 原生桥，不代表网站当前可访问或 iOS 已验证。

尚未在 iPhone/iPad 的 Scripting 中实测：原生状态栏变化、网络授权、图片 Referer 回退、双指缩放。网站结构变化、登录、验证码、动态 JavaScript 加密图片和分页目录需要进一步适配。当前没有 Android 版本的 200 MB 磁盘图片缓存；图片缓存由 WebKit 管理。连续阅读的图片节点会随章节增加，长时间阅读可从目录重新进入当前章释放旧节点。

接口依据：
- [Scripting WebViewController](https://scriptingapp.github.io/guide/Device%20Capabilities/WebViewController)
- [Scripting Storage](https://scriptingapp.github.io/guide/Utilities/Storage)
- [状态栏与系统覆盖层](https://scriptingapp.github.io/guide/View%20Modifiers/Status%20Bar%20%26%20System%20Overlays)
