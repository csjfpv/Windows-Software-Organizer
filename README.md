# 软件启动台

一个给 Windows 整理常用软件、文件夹和项目入口的小工具。

平时电脑里装的软件、项目目录和常用网页越来越多，靠桌面快捷方式不太好找，就做了这个。按分类放好，之后可以搜索、拖动排序，点一下就打开。

![主界面](docs/images/main-window.png)

[下载](https://github.com/csjfpv/Windows-Software-Organizer/releases/latest) · [提问题](https://github.com/csjfpv/Windows-Software-Organizer/issues) · [更新记录](https://github.com/csjfpv/Windows-Software-Organizer/releases)

## 能做什么

- 给程序、文件、文件夹和网页建入口
- 分类、搜索和拖动排序
- 给程序保存启动参数和工作目录
- 导入、导出自己的配置
- 不需要登录账号，也不会扫描电脑里的软件

它只记住入口，不会移动、复制或删除原来的文件。

## 下载

Release 页面有两个版本：

- `Software-Launchpad-Setup.exe`：安装版
- `Software-Launchpad-Portable.exe`：便携版，下载后直接运行

也可以下载 `SHA256SUMS.txt` 校验文件。当前安装包没有代码签名，第一次运行时 Windows 可能会弹出未知发布者提示，只建议从本仓库的 Release 页面下载。

## 用法

打开后点“添加项目”，选程序、文件夹、文件或网页，填个名字和分类就行。

配置保存在本机。导入别人的配置前最好先看一眼内容，里面可能带有路径和启动参数。导出的 JSON 也可能包含自己的本机路径，发给别人前记得处理一下。

## 自己编译

需要 Windows、Node.js 20+ 和 pnpm。

```powershell
pnpm install
pnpm dev
```

打包 Windows 版本：

```powershell
pnpm lint
pnpm test
pnpm package:win
```

## 其他

- [SECURITY.md](SECURITY.md)：安全相关说明
- [PRIVACY.md](PRIVACY.md)：隐私说明
- [CONTRIBUTING.md](CONTRIBUTING.md)：提交代码前可以看看
- [LICENSE](LICENSE)：MIT License

这是一个独立的小工具，和其他同类软件没有关系。第三方开源依赖和素材来源分别在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [ASSET_SOURCES.md](ASSET_SOURCES.md)。
