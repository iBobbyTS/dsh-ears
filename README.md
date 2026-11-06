# dsh-ears

中文 · [English](README.en.md)

为 Apple Silicon macOS 上的 DSH Web UI 和 Desktop 提供本地 Qwen3-ASR MLX 语音输入。转写结果保留在可编辑草稿中，由用户手动发送。

这是 [WizisCool/dsh-ears](https://github.com/WizisCool/dsh-ears) 的 fork。请从本 fork 的 Git 仓库或已验证 tarball 安装和更新；上游 npm 版本不包含本 fork 的改动。

## 兼容性

已验证：DSH 0.2.2-rc.1（源码与自动化检查）；尚未完成 Desktop 实测。Qwen 推理与麦克风验收独立于包和加载器检查。

需要 Apple Silicon macOS、可发现的 Python 3.10+ 和 DSH 支持的 Node 运行环境（`^22.19.0 || >=24.0.0`）。DSH 管理安装依赖；插件交付预构建 JavaScript，安装时不编译。模型安装是单独的步骤，首次需要访问 PyPI/Hugging Face。

<a name="install"></a>

## 安装

Desktop：先打开一次 DeepSeek Harness，让应用初始化自己的 profile，然后完全退出应用。使用应用安装的 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "git+https://github.com/iBobbyTS/dsh-ears.git"
```

Web：

```sh
dsh plugin --profile web add "git+https://github.com/iBobbyTS/dsh-ears.git"
```

固定候选可在 Git URL 后加 `#<commit>`，也可把 URL 换成已验证 `dsh-ears-0.4.3.tgz` 的绝对路径。应选择包含已检查 `lib/` 产物的 fork 提交。安装后重启 Host 并刷新 Client。

更新时重复相同的 add 命令，使用本 fork 的 URL 或新的指定提交/tarball，然后重启 Host、刷新 Client。关于页面链接到本 fork 的说明，不再查询上游 npm，也不会自动安装更新。

## 使用

在 dsh-ears 设置 → 识别中安装运行环境和模型，配置模型、上下文提示与空闲卸载时间。点击 Composer 麦克风或按 `Ctrl+Shift+Space` 开始/停止，检查草稿后手动发送。无需单独 API 服务器，推理在本地执行。

## 文档

[使用与设置](docs/usage.zh.md) · [开发与验证](docs/development.md) · [项目文档](docs/README.md) · [贡献](CONTRIBUTING.md) · [开发规范](AGENTS.md)

[历史](CHANGELOG.md) · [安全](SECURITY.md) · [MIT](LICENSE)
