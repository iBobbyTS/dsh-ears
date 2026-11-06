# dsh-ears

中文 · [English](README.en.md)

为 DSH Web UI 和 Desktop 提供语音输入、实时转写及可选 LLM 润色；结果写入可编辑草稿，由用户手动发送。支持浏览器 Web Speech、本地 Whisper、Apple Silicon 上的本地 Qwen3-ASR MLX，以及多种云端 ASR。

这是 [WizisCool/dsh-ears](https://github.com/WizisCool/dsh-ears) 的 fork。安装本 fork 需要从以下 checkout 构建；上游 npm 包及应用内上游 npm 版本信息不包含本 fork 的改动。

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

在设置的 dsh-ears 页面选择识别后端，点击 Composer 麦克风或按 `Ctrl+Shift+Space` 开始/停止。检查草稿后手动发送；人工修改会被保留。

- 本地 Qwen：要求 Apple Silicon macOS、可发现的 Python 3.10+。在识别设置中安装运行环境和模型后直接录音，无需单独启动服务器；首次下载需要 PyPI/Hugging Face 网络。
- Whisper：在设置中下载 GGML 模型，使用内置 native runtime，无需 Python/FFmpeg。
- Web Speech 可能由浏览器厂商远端处理；云端后端需要相应凭据。模型润色使用 DSH 已配置的模型并产生用量。

DSH 0.2.2-rc.1 已做源码合同核对和自动化验证；这些结果不代表已完成真实 Desktop、麦克风或 M4 Max 端到端验收。

## 文档

[使用与设置](docs/usage.zh.md) · [项目文档](docs/README.md) · [贡献](https://github.com/iBobbyTS/dsh-ears/blob/master/CONTRIBUTING.md) · [开发规范](https://github.com/iBobbyTS/dsh-ears/blob/master/AGENTS.md)

[历史](CHANGELOG.md) · [安全](https://github.com/iBobbyTS/dsh-ears/blob/master/SECURITY.md) · [MIT](LICENSE)
