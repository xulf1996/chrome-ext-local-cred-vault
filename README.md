# Local Cred Vault

一个按「登录地址 + 项目」维度管理本地开发账号密码的 Chrome 扩展。
解决 Chrome 原生密码管理器在同一个 origin（典型的 `localhost:80`）下只能存一份凭据的痛点。

## 功能

- **以项目为主维度**：项目名**必填**，登录地址**选填**；列表默认按项目分组
- **项目可复用**：新增时从下拉里选已有项目，也可直接敲一个新的项目名
- **一键复制**：密码、账号；复制后 30 秒自动清空剪贴板
- **本地 JSON 文件存储**：你选一个本地 `.json` 文件作为数据文件，插件读写它；可放进 Git、跨机器拷、文本编辑器打开看
- **强密码生成**：20 位，含大小写 / 数字 / 符号
- **零页面权限**：不注入任何 content script，不读取你浏览的网页内容
- **防重提交**：新增 / 删除 / 切换分组等任何写操作都有四层防护（详见下文）
- **可移植**：`preview/index.html` 可以直接双击打开看 UI

## 数据怎么存

数据保存在**你自己选择的一个本地 JSON 文件**里（典型位置：`cred-vault.json`）。
插件只声明 `clipboardWrite` 一个权限，文件句柄存在浏览器自己的 IndexedDB 里，
**不读你浏览的任何网页、不写 `chrome.storage`**。

- 文件路径由你决定，可以放在任何目录（项目内、网盘同步目录、Git 仓库里都行）
- 写入是原子的：先写临时文件再替换，写到一半失败也不会损坏原文件
- 浏览器重启后首次打开插件，会弹一次授权确认（这是 File System Access API 的标准行为）
- 想换数据文件：在管理页点「切换文件」或「另存为副本」

**凭据是明文存的**（这是按你的选择——"反正是我自己在本地使用"）。
本机任何能读该文件的程序都能看到它。请勿用于存放银行、主邮箱等真实资产口令。
想迁移或备份，用「另存为副本」即可。

## 防重提交（四层）

| 层 | 机制 | 在哪个文件 |
|---|---|---|
| 1 | UI 按钮 busy 时禁用 | `src/options.js` 的 `busy` 标志 + `btnSave.disabled` |
| 2 | 写入单飞队列：并发 save 会被合并、不会交错 | `src/js/store.js` 的 `writing` / `pending` / `drain` |
| 3 | 写入原子化：先写临时文件再替换 | `src/js/store.js` 的 `writeTo` |
| 4 | 稳定 ID：新增时预生成 id，重复提交天然幂等 | `src/js/storage.js` 的 `newId()` + `options.js` 的 `editingId` |

四层任何一层单独都能挡住重复点击；但只靠一层容易在边界场景漏掉（比如按钮 disable 在网络慢的场景失效）。
四层叠加后，**即便前两层都失效也不会产生重复条目**。

## 安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」
4. 选择本仓库根目录（包含 `manifest.json` 的目录）

更新代码后回到 `chrome://extensions/` 点击本插件的刷新图标即可。

## 使用

- **点工具栏图标** → 弹出 popup：搜索 / 一键复制
  - 默认**按项目分组**，右上角可切到「按地址」或「不分组」
  - 搜索框里直接回车 → 复制第一条命中的密码
  - 密码默认遮罩，点遮罩文字切换显示
- **popup 右下角「新增」或「管理」** → 打开完整管理页：
  - 增删改查
  - 「生成」按钮生成强密码
  - 「另存为副本」保存到另一个 JSON 文件
  - 「从文件导入」按 ID 合并（同 ID 覆盖更新，其余追加）
  - 「切换文件」换数据文件

## 文件结构

```
manifest.json                # Manifest V3 配置（权限仅 clipboardWrite）
src/
  popup.html / popup.js      # 工具栏弹窗
  options.html / options.js  # 完整管理页
  style.css                  # 共享样式（深色主题）
  js/
    storage.js               # 数据模型、归一化、搜索、分组、合并、文件格式
    store.js                 # File System Access 读写 + 写入单飞队列
    idb.js                   # IndexedDB（存文件句柄）
    ui.js                    # HTML 转义、密码遮罩、剪贴板、Toast、强密码生成
  icons/                     # 16 / 48 / 128 PNG 图标
preview/
  index.html                 # 静态 UI 预览（无功能，可直接浏览器打开）
tools/
  make_icons.py              # 重新生成图标
  selftest.mjs               # 核心逻辑自测（node tools/selftest.mjs）
```

## 自测

```bash
node tools/selftest.mjs
```

覆盖：地址归一化、分组与搜索、项目必填 / 地址选填、文件格式序列化往返、错误 JSON 拒绝、合并策略。
