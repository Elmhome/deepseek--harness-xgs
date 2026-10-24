# XGS · DeepSeek Harness

DeepSeek Harness 原生插件版本。助手名为 **小怪兽**，称呼用户为 **Elmhome**；唤醒词为 `XGS`、`xgs`、`小怪兽`。
沿用现有 XGS 框架正文，通过 `ctx.systemPrompt.section()` 注册框架，通过 `agent/status` 和 `agent.followup()` 完成有上限的后续回复。

## 在这台 Mac 上使用

1. 先打开一次 DeepSeek Harness，让它创建桌面 profile，然后完全退出应用。
2. 双击当前目录里的 **`start.command`**。脚本会安装本地插件，添加 profile bundle，再打开 DeepSeek Harness 桌面应用。
3. 新建对话，发送 `XGS`。预期回复：

```text
Elmhome I'm here，干什么你直说。
```

仅安装、不打开应用：双击 `install.command`。卸载：双击 `uninstall.command`，然后重启应用。
如果应用已经打开，启动器只会打开或带到前台；需要完全退出后重开，新的会话才会加载新配置。

执行权限已设置。复制后如权限丢失，在项目目录执行：

```bash
chmod +x start.command install.command uninstall.command
```

只检查环境，不安装、不启动会话：

```bash
./start.command --check
```

## 安装位置和更新

默认目标是 `~/.dsh/profiles/desktop/package.json`。脚本通过应用自带的 `dsh plugin --profile desktop` 命令，
以 `link:` 方式安装当前目录，再把 `xgs` 加到 `dsh.profile.bundles` 末尾。
插件只依赖 Node.js 内置模块，本地安装使用 `--offline`，不需要另外安装 pnpm。
修改前会备份 `package.json`；其他依赖、bundle 和 profile 设置保留。

本地链接直接指向这个项目，请保留项目目录。修改源码后，完全退出并重开应用，再新建对话。
卸载会移除 `xgs` 依赖和 bundle 条目，保留其他设置、源文件和运行日志。
如同一个 profile 已有其他来源的 `xgs` 包，脚本会报出冲突并停止。

可用 `DSH_APP`、`DSH_CLI`、`NODE_EXE` 指定自定义应用、CLI 或 Node.js 路径。
`DSH_HOME` 可指定配置根目录，`DSH_PROFILE` 可指定已存在的其他 profile，默认 `desktop`。

## 原生接口

- `package.json`：ES module 包、Cordis 插件和 bundle 元数据。
- `cordis.patch.yml`：使用当前版本的 `insert` 补丁格式添加 `xgs` 配置行。
- `index.js`：以 `xgs:operating-frame` 注册 `prompts/xgs.md`，顺序为 `-99999`，按原文插入。
- 唤醒确认：只有回答未包含确认语时才追加一次；正确回答直接结束。
- 拒绝恢复：每个原始用户输入最多两次。插件生成的 followup 即使开启新 agent turn，也不会重置上限。
- 只在正常完成后检查回答，取消或报错的轮次不追加回复。

运行日志：`~/.dsh/logs/xgs/runtime.log`，或 `$DSH_HOME/logs/xgs/runtime.log`。
`ready` 表示原生插件已加载；`wake_ack`、`refusal_recover` 表示追加了相应消息。
`rules/` 和 `skills/` 保留框架文本副本，宿主实际使用的是原生系统提示词注册。

## 验证

已在本机 DeepSeek Harness `0.2.1-rc.2` 上验证本地包安装、重复安装、卸载和配置合成，
并使用应用自带的 Cordis / SystemPrompt 运行时实际加载插件、渲染系统提示词。

```bash
npm test
```

测试覆盖当前事件结构、跨自动续跑的两次上限、唤醒确认及取消/正常结束。
验证使用临时 profile 和模拟事件，未调用真实模型；实际回答需要安装后在新会话中验证。

接口参考：[DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)。
