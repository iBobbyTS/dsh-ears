# 使用指南

[安装](../README.md) · [English](usage.en.md)

## 使用

1. 点击麦克风图标，或按下 `Ctrl+Shift+Space`（可在设置页更改）
2. 开始说话
3. 再次按下快捷键或点击麦克风，停止录音并开始转写
4. 开启润色后，原始转写会先写入草稿，润色完成后再更新，期间的手动编辑会被保留
5. 检查内容后手动发送

转写结果始终写入可编辑草稿，不会自动发送。如果所选后端尚未就绪，麦克风图标会变灰，悬停即可查看原因。

## 识别后端

| 后端 | 工作方式 | 需要什么 |
| --- | --- | --- |
| Web Speech | 浏览器实时识别 | 默认后端；Chromium 内核浏览器 |
| 本地 Qwen3-ASR (MLX) | Apple Silicon 上本地流式识别 | 在设置中安装运行环境与模型；详见下文 |
| 本地 Whisper | 录音结束后本地转写 | 在设置页下载 GGML 模型 |
| [Groq](https://console.groq.com) | [Groq Whisper API](https://console.groq.com/docs/speech-text) | API key |
| [Deepgram](https://deepgram.com) | [预录音频](https://developers.deepgram.com/docs/pre-recorded-audio)或[实时音频流](https://developers.deepgram.com/docs/live-streaming-audio) | API key、模型名（如 `nova-3`） |
| [阿里云百炼](https://www.aliyun.com/product/bailian) | [DashScope 同步转写](https://help.aliyun.com/zh/model-studio/fun-asr-flash-recorded-speech-recognition-http-api) | API key、同步模型 ID；单次最长 300 秒 |
| [腾讯云](https://cloud.tencent.com/product/asr) | [录音文件识别](https://cloud.tencent.com/document/api/1093/37823)或[实时语音识别](https://cloud.tencent.com/document/api/1093/48982) | AppID、SecretID、SecretKey、`engine_type` |
| [小米 MiMo](https://mimo.mi.com) | [语音识别 API](https://mimo.mi.com/docs/zh-CN/api/audio/Speech-Recognition)，支持标准 API 或 [Token Plan](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/subscription) | API key、模型名（如 `mimo-v2.5-asr`）；Token Plan 需选择区域集群 |
| [硅基流动 (CN)](https://siliconflow.cn) | [语音转写 API](https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post) | API key、模型名（如 `FunAudioLLM/SenseVoiceSmall`） |
| [火山引擎](https://www.volcengine.com/product/doubao) | [录音文件识别（大模型）](https://docs.volcengine.com/docs/6561/1354868)或[单向流式语音识别](https://docs.volcengine.com/docs/6561/2628951) | API key（新版控制台 X-Api-Key）、资源 ID |
| 自定义 OpenAI 兼容 | 发送到指定 `/audio/transcriptions` 端点 | 端点地址、API key、模型名 |

> **本地 Whisper**：基于 `@fugood/whisper.node` 本地运行 whisper.cpp，无需 Python、FFmpeg 或外部依赖。支持在设置页下载管理 GGML 模型（`tiny`（默认）至 `turbo`），并可选 `default`（自动）、`vulkan` 或 `cuda` 加速。
>
> **阿里云百炼**：升级后的控制台使用业务空间专属域名（华北2 北京为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`，新加坡为 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`）。请填写该 API Host 和**同步模型 ID**（如 `qwen3-asr-flash`、`qwen-audio-3.1-asr-flash`、`fun-asr-flash-2026-06-15`），不要填控制台显示名称，也不要使用 `-filetrans`、`-streaming`、`-message`、`-realtime` 变体，这些模型走异步任务或 WebSocket 接口，dsh-ears 不支持。
>
> **火山引擎**：仅支持新版控制台的 API Key（`X-Api-Key`）鉴权（不支持旧版 AppID + Access Token），可在[控制台 API Key 管理](https://console.volcengine.com/speech/new/setting/apikeys)页面获取。

## 润色

默认开启。提供方和模型都留空时使用 dsh 的默认 Agent 模型（包括默认推理设置）；也可以从 dsh 已配置的模型中选择。LLM 凭据复用 dsh 现有配置。支持设置推理强度。

默认提示词会删除口头禅、修正 ASR 错字、处理自我纠正和口头列举。可在设置页自定义提示词或查看默认内容。润色失败或取消时保留原始转写。

## 设置

安装后在 Web UI 的设置页出现 dsh-ears 面板，分为四个标签页：

| 标签页 | 可配置项 |
| --- | --- |
| 常规 | 设置页显示名称、语音快捷键开关与组合键、提示音开关、最长录音时间（1–600 秒，默认 120 秒） |
| 识别 | 后端选择、语言、本地 Whisper 模型和加速方式、云服务提供方及各提供方凭据 |
| 润色 | 开关、LLM 提供方和模型、推理强度、自定义提示词（最长 4000 字） |
| 关于 | 版本号、许可证、dsh 兼容范围、上游 npm 版本信息（不提供安装或更新命令） |

## 已知限制

- Web Speech 后端依赖浏览器实现，音频可能被发送到浏览器厂商的服务端处理，不是完全的本地/离线方案。
- 百炼单次录音最长 300 秒；Qwen-Audio-3.1 对极短或静音音频可能返回“无词”，短语音输入建议使用 `qwen3-asr-flash`。
- Deepgram Flux 系列模型需要 Listen V2 协议，当前不支持。
- 本地 Whisper 单次音频限制 24 MB，转写超时 120 秒。
- 加速方式（`default` / `vulkan` / `cuda`）在首次 native 加载后锁定，切换需重启 `dsh web`。


## 本地 Qwen3-ASR 流式输入

本 fork 提供 Apple Silicon macOS 上的 Qwen3-ASR MLX 有状态流式识别，可在 DSH Composer 内实时更新文字、回退修订。语音文字使用版本校验的选区写入，不会整篇重建草稿、删除引用 Chip。录音期间人工修改或提交草稿后，迟到的语音结果不会覆盖人工内容。

使用方式：在「插件设置 → 识别」中选择「本地 Qwen3-ASR (MLX)」，选 1.7b-8bit（默认）或 0.6b-8bit，点击「安装 / 下载」。插件在 DSH Host 下自动创建独立 Python venv、安装固定版本 mlx-qwen3-asr、下载模型。下载完成后直接在 Composer 点击麦克风使用，不需要手动 serve、开放监听端口或维护独立服务。

插件面板支持取消下载、删除权重、预加载服务、手动卸载。默认 **60 分钟空闲 TTL**（可配置 1–1440 分钟）：最后一个活动会话结束后计时，到期停止模型 Worker，释放内存，**权重文件保留在本机**，下次识别自动加载。活跃录音不会被空闲计时器终止。

系统要求：macOS Apple Silicon、可发现的 Python 3.10+；首次安装必须连接 PyPI 和 Hugging Face，安装过程中可以在插件设置里取消；推理始终在本机。非 Apple Silicon 系统继续使用现有 Whisper/Web Speech/云端后端。

当前尚未经过 M4 Max 实机端到端验收。原生流式采用 Qwen3-ASR 窗口重解码 + Prefix Rollback，默认 1 秒块。如在录音中手动修改 Composer，插件将放弃之后对此段的自动写入，避免覆盖用户草稿。
