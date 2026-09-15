# Windows软件整理工具

> 为 Windows 桌面整理程序、文件、项目目录与常用网页的本地启动中心。

Windows软件整理工具将分散在电脑各处的入口集中到一个可分类、可搜索、可排序的桌面界面。它只保存入口信息，不移动、不复制、不上传你的软件、文件或项目。

![Windows软件整理工具主界面](docs/images/main-window.png)

[下载最新版本](https://github.com/csjfpv/Windows-Software-Organizer/releases/latest) · [查看更新说明](https://github.com/csjfpv/Windows-Software-Organizer/releases) · [提交问题](https://github.com/csjfpv/Windows-Software-Organizer/issues)

## 适用场景

- 为开发工具、设计软件、办公程序建立统一入口
- 将项目目录、文档、脚本和常用网页按分类整理
- 为程序保存启动参数和工作目录
- 用搜索和拖拽排序快速定位高频入口

## 功能

- 分类导航、数量统计、名称与路径搜索
- 添加程序、文件、文件夹和 HTTP/HTTPS 网页
- 编辑、移除与拖拽排序入口；不会删除本机目标文件
- 程序启动参数、工作目录和自定义图标路径
- 本地启动次数统计与 JSON 配置导入/导出
- 配置原子写入、上一版本地备份和损坏恢复
- 不需要账号、无云同步、无遥测、无联网扫描

## 下载与安装

在 [Releases](https://github.com/csjfpv/Windows-Software-Organizer/releases/latest) 页面下载：

| 文件 | 用途 |
| --- | --- |
| `Windows-Software-Organizer-Setup.exe` | Windows 安装版，可选择安装目录。 |
| `Windows-Software-Organizer-Portable.exe` | 便携版，无需安装。 |
| `SHA256SUMS.txt` | 两个 EXE 的 SHA-256 校验值。 |

发布页同时提供许可证、第三方开源声明、素材来源和品牌政策。安装包目前**未配置商业代码签名证书**，Windows SmartScreen 可能显示“未知发布者”；请仅从本仓库 Releases 下载，并按 SHA-256 校验文件核验安装包。

## 快速开始

1. 打开应用后，点击“添加项目”。
2. 选择程序、文件、文件夹或网页，并填写分类。
3. 需要时填写启动参数与工作目录。
4. 保存后可搜索、排序或直接打开入口。

首次使用时列表为空。应用不会自动扫描或上传你的软件清单。

## 配置与安全

配置仅保存在 Electron 的本机用户数据目录。导出的 JSON 可能包含本机路径与启动参数，分享前请先脱敏。

- 导入配置上限为 2 MB、100 个分类和 2,000 个应用
- UNC、设备路径和无盘符根路径会被拒绝
- 导入条目、旧配置条目和新建条目的文件图标预览默认关闭
- 只有用户在编辑时明确启用“本地图标预览”，应用才会访问对应目标或图标路径
- 配置主文件损坏时会尝试使用上一版备份恢复；双份损坏会显示错误，不会静默覆盖

完整安全设计见 [SECURITY.md](SECURITY.md)，隐私说明见 [PRIVACY.md](PRIVACY.md)。

## 本地开发

环境要求：Windows 10/11、Node.js 20+、pnpm 11+。

```powershell
pnpm install
pnpm dev
```

质量检查与 Windows 打包：

```powershell
pnpm lint
pnpm test
pnpm build
pnpm package:win
```

构建产物默认写入 `release/`，不提交到 Git。

## 参与贡献

欢迎通过 [Issues](https://github.com/csjfpv/Windows-Software-Organizer/issues) 报告问题，通过 Pull Request 提交改进。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。不要提交本机配置、绝对路径、日志、软件安装包、证书、密钥或个人数据。

## 项目边界

本项目是独立开发的通用 Windows 入口管理器，不分发第三方软件、固件、驱动、破解工具或维护者电脑中的任何程序。项目名称、源代码、界面实现和项目图标均独立设计；不使用或复制第三方产品的名称、代码、Logo、图标、截图、文案、工具清单或其他素材。本项目与任何第三方工具箱产品、社区及其权利人不存在隶属、授权、合作、赞助或官方认可关系。详情见 [TRADEMARKS.md](TRADEMARKS.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方开源组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，界面与图标来源见 [ASSET_SOURCES.md](ASSET_SOURCES.md)。
