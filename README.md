# MANGE · Scripting

将原 Android Mange 的漫画阅读流程迁移到 iPhone / iPad 的 Scripting App。入口为 TypeScript TSX，界面使用内嵌 WebView，数据保存在 Scripting Storage。

## 在 Scripting 中运行

1. 在 Scripting App 中新建名为 `MANGE` 的脚本项目。
2. 将仓库的 `index.tsx` 和 `ui.ts` 放到该项目根目录；这两个文件就是运行所需文件，不需要 npm 或服务器。
3. 运行 `index.tsx`，首次运行按 Scripting 提示允许网络访问。
4. 输入漫画名并搜索，点开结果后加入书架或选章节。下次点书架会继续阅读。

`ui.ts` 已包含默认瓜子漫画源。导入源接受 GitHub blob 文件链接（常规分支名）及 Raw HTTPS JSON 链接；私有源仓库认证暂不支持。用户数据不会上传到 GitHub，Android 旧版阅读进度不会自动迁移。

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
