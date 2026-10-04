# Dayflow

随手记录一天中的事情，按天回顾。

第一阶段已实现基础随手记：新建、多行纯文本、日期浏览、补记、条目内编辑、回收站、主题与中英文设置。功能检查与性能测量由用户人工进行，不编写或执行测试。

## 本地开发

```bash
npm install
npm run dev
```

## 静态检查与构建

```bash
npm run lint
npm run build
```

平台打包命令：`npm run build:mac`、`npm run build:win`、`npm run build:linux`。

## 数据目录

正式记录、应用偏好及迁移版本由 Electron 主进程使用内置 `node:sqlite` 管理，无需安装额外 SQLite 原生驱动。项目使用 Electron 39。

- 数据库：Electron `userData` 目录下的 `data/dayflow.sqlite`；macOS 默认位于 `~/Library/Application Support/Dayflow/data/dayflow.sqlite`。

数据库使用 WAL 与 FULL 同步模式。新建提交直接写入数据库，使用稳定 ID 重试去重。数据库无法读取时显示错误并保留原文件。未提交输入仅在当前窗口内保留，关闭后不恢复。

若手动复制数据库文件，应先退出应用并保留相邻的 WAL 文件；本版未实现导入、导出或备份恢复功能。

## 界面主题

浅色模式按提供的 GPT / Codex 日间主题配色：背景 `#ffffff`、正文 `#0d0d0d`、强调色 `#3a83f7`，以柔和灰阶区分卡片、侧栏、悬停与边框。语义色使用新增 `#00a240`、删除/错误 `#e02e2a`、技能 `#751ed9`。主题变量集中在 `src/renderer/src/assets/main.css`。

浅色界面优先使用随应用打包的 Geist、Inter 可变字体，中文使用系统字体回退；夜间模式保留原有字体与配色。Markdown 编辑器的背景、正文、选区与焦点状态跟随应用主题。

## 日报模块

主页右上角的“日报”进入独立日报页，日期导航在两个页面中共用。编辑与预览分别由 `DailyReportEditor`、`DailyReportPreview` 提供，均通过属性接收内容，可独立组合。编辑区使用 CodeMirror，支持 Markdown 语法高亮、常用格式按钮、撤销/重做，以及 ⌘ / Ctrl + B、I 快捷键。预览区使用 react-markdown 与 remark-gfm，支持标题、列表、引用、链接、代码块、表格和任务列表；不渲染原始 HTML。日报草稿保留 Markdown 源码。

- 主页可用宽度达到 768px 时，左侧随手记、右侧日报编辑；不足时仅显示随手记。
- 日报页可用宽度达到 688px 时，左侧编辑、右侧预览；不足时通过“预览”手动打开，保持两栏最小宽度并横向滚动到预览。
- 分隔条支持拖拽与方向键调整。随手记最小宽度 400px、日报编辑 360px、预览 320px；阈值集中在 `components/responsive-split.tsx`。

日报默认关闭自动保存，使用“保存”按钮或 ⌘ / Ctrl + S 保存当前日期。设置 → 常规 → 日报中可选择关闭、每 10 秒、每 30 秒、每 1 分钟、每 5 分钟，设置会保留。修改内容仅更新内存，固定计时到期时批量保存有修改的日报，没有修改时不写入；输入不会重置计时。主页与日报页共享内容，切换日期会保留未保存的草稿，关闭应用时提示保存所有修改或放弃。已经保存的日报在重新打开应用后可恢复。草稿使用渲染层 `localStorage`（`dayflow.daily-reports.v1`），尚未接入正式记录的 SQLite 数据库。保存失败时保留当前内容并提供重试，读取失败时暂停编辑以保护已有数据。

## 代码结构

- `src/shared`：日志、IPC 接口、语言注册与日期归属规则。
- `src/main/store.ts`：SQLite 初始化、迁移、记录管理、偏好。
- `src/main/index.ts`：单实例窗口、自定义标题栏、受控 IPC 与关闭流程。
- `src/preload`：向渲染层暴露有限的数据接口与窗口事件。
- `src/renderer/src`：每日记录、回收站、设置、双语文案与 shadcn/ui 组件。

新增界面语言时，在 `src/shared/languages.ts` 注册语言代码与系统语言匹配规则，在 `src/renderer/src/lib/locales` 添加完整文案，并加入 `lib/i18n.ts` 的资源映射。无需修改日志或数据库结构。

## 需求与开发记录

- [第一阶段需求（v1.0）](docs/requirements/phase-1-quick-notes.md)
- [第一阶段开发记录](docs/development/phase-1.md)
