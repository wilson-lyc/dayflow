# Dayflow

随手记录一天中的事情，按天回顾。

第一阶段已实现基础随手记：新建、多行纯文本、草稿缓存、日期浏览、补记、条目内编辑、回收站、主题与中英文设置。功能检查与性能测量由用户人工进行，不编写或执行测试。

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
- macOS 草稿：`~/Library/Caches/Dayflow/draft.json`。
- 其他平台草稿：Electron `userData` 目录下的 `cache/draft.json`。

数据库使用 WAL 与 FULL 同步模式。新建提交先缓存稳定 ID 与记录时间，再写入数据库；成功后清理草稿。缓存清理失败不撤销正式记录，启动时通过 ID 核对提交状态。数据库无法读取时显示错误并保留原文件。

清理草稿缓存不会删除记录或偏好。若手动复制数据库文件，应先退出应用并保留相邻的 WAL 文件；本版未实现导入、导出或备份恢复功能。

## 代码结构

- `src/shared`：日志、草稿、IPC 接口、语言注册与日期归属规则。
- `src/main/store.ts`：SQLite 初始化、迁移、记录管理、偏好与草稿缓存。
- `src/main/index.ts`：单实例窗口、自定义标题栏、受控 IPC 与关闭流程。
- `src/preload`：向渲染层暴露有限的数据接口与窗口事件。
- `src/renderer/src`：每日记录、回收站、设置、双语文案与 shadcn/ui 组件。

新增界面语言时，在 `src/shared/languages.ts` 注册语言代码与系统语言匹配规则，在 `src/renderer/src/lib/locales` 添加完整文案，并加入 `lib/i18n.ts` 的资源映射。无需修改日志或数据库结构。

## 需求与开发记录

- [第一阶段需求（v1.0）](docs/requirements/phase-1-quick-notes.md)
- [第一阶段开发记录](docs/development/phase-1.md)
