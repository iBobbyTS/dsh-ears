# dsh-ears

中文 · [English](README.en.md)

为 DSH Web UI 和 Desktop 提供本地 Qwen3-ASR MLX 语音输入与实时转写；结果写入可编辑草稿，由用户手动发送。需要 Apple Silicon macOS。

这是 [WizisCool/dsh-ears](https://github.com/WizisCool/dsh-ears) 的 fork。安装本 fork 需要从以下 checkout 构建；上游 npm 包及应用内上游 npm 版本信息不包含本 fork 的改动。

## 兼容性

已验证：DSH 0.2.2-rc.1（源码与自动化检查）；尚未完成 Desktop 实测。

## 安装

需要 DSH、Node.js `^22.19.0 || >=24.0.0` 和 `package.json` 指定的 pnpm。macOS 直接运行：

```sh
git clone https://github.com/iBobbyTS/dsh-ears.git
cd dsh-ears
pnpm install --frozen-lockfile
pnpm build
```

Windows/WSL 首次安装或切换两者时，在安装依赖前运行 `pnpm use:platform`；**macOS 不运行该命令**。详细构建与验证见[开发指南](docs/development.md)。

Desktop：在应用插件管理器中选择构建后的仓库目录。Web：从该目录运行：

```sh
dsh plugin --profile web add "$PWD"
```

Windows cmd 请使用完整路径。重启 DSH Host 并刷新页面。更新时更新本 checkout、重新构建，再通过同一入口重新安装；Desktop 的 `desktop` profile 由应用管理。

## 使用

点击 Composer 麦克风或按 `Ctrl+Shift+Space` 开始/停止，检查草稿后手动发送。在识别设置中配置模型、上下文提示和空闲卸载时间。

本地 Qwen 要求 Apple Silicon macOS、可发现的 Python 3.10+。在识别设置中安装运行环境和模型后直接录音，无需单独启动服务器；首次下载需要 PyPI/Hugging Face 网络，推理在本地执行。

## 文档

[使用与设置](docs/usage.zh.md) · [项目文档](docs/README.md) · [贡献](https://github.com/iBobbyTS/dsh-ears/blob/master/CONTRIBUTING.md) · [开发规范](https://github.com/iBobbyTS/dsh-ears/blob/master/AGENTS.md)

[历史](CHANGELOG.md) · [安全](https://github.com/iBobbyTS/dsh-ears/blob/master/SECURITY.md) · [MIT](LICENSE)
