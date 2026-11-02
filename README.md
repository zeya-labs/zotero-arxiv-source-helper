# arXiv Source Helper for Zotero

保存论文时保留 TeX 源码，让 AI 按章节、关键词和表格读取原文，并定位到源文件和行号。

浏览器照常使用 Zotero Connector。桌面端插件会为新收录的 arXiv 文献补充源码；已有文献可以手动补充。无需模型密钥或 MinerU 密钥，源码从 arXiv 下载，不上传 PDF。

**当前为预览版。** 已通过自动测试和真实 arXiv 源码解析；真实 Zotero 安装、Connector 保存、附件索引的完整流程尚未验证。兼容性声明为 Zotero 7–10，开发环境为 Windows / Zotero 10.0.7，其他版本和系统尚未实测。详见 [验证记录](docs/VALIDATION.md)。

## 下载与安装

1. 在 [Releases](https://github.com/zeya-labs/zotero-arxiv-source-helper/releases) 下载 `.xpi` 安装包。
2. 在 Zotero 打开 **工具 → 插件 → 齿轮 → 从文件安装插件**，选择 `.xpi`，按提示确认安装或重启。
3. 确认工具菜单里出现 **arXiv Source Helper**。

不需要修改或重新安装浏览器里的 Zotero Connector。

## 使用

**新文献：** 在 arXiv 页面点击 Zotero Connector 保存，桌面插件自动将其加入源码下载队列。

**已有文献：** 在 Zotero 中选中文献，点击 **工具 → arXiv Source Helper → 为选中文献下载 TeX 源码**。菜单中也可开关自动下载、查看下载状态。

每篇文献会增加两个附件：

| 附件                    | 内容                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| arXiv TeX 阅读版 · IDvN | HTML 阅读副本：章节目录、表格源码、按引用顺序展开的 TeX，附源文件名和行号 |
| arXiv 原始源码 · IDvN   | arXiv 返回的原始压缩包；可能是单个 TeX，也可能是含图片的多文件包          |

阅读版保留公式和表格的 **TeX 命令**，不是排版后的数学公式或表格。原 PDF 仍适合核对图形和最终排版。

普通附件可随 Zotero 文件同步。解包后的查询缓存存于 Zotero 数据目录的 `arxiv-source-helper/tex_source/<libraryID>-<itemKey>/`，属于本机数据；换电脑后可重新下载。插件不会自动扫描整个旧文献库。

## 给 AI 读取

附带的 `query.mjs` 是只读客户端，需要 Node 24+、正在运行的 Zotero 和已启用的插件。将 `ABCD1234` 替换为文献的 Zotero 条目编号，先在菜单中完成源码下载：

```sh
node query.mjs ABCD1234 headings
node query.mjs ABCD1234 section "Active Interaction"
node query.mjs ABCD1234 search "privileged"
node query.mjs ABCD1234 table "tab:interaction_memory"
node query.mjs ABCD1234 full
```

返回的章节、搜索结果和表格携带源文件名、行号或相应定位信息。建议先读目录，再查具体章节或表格，而不是一次把全文送入上下文。表格优先按 label 或 caption 查询。

客户端的第 4、5 个参数可指定端口和 libraryID，默认 `23119` 和 `1`。详细参数见 [本地查询接口](docs/LOCAL-API.md)。查询不会隐式发起下载。

## 版本与下载行为

- 从条目 URL、DOI、Extra、PDF 附件 URL 识别 arXiv ID 和版本。未指定版本时先确定版本，再使用固定版本地址下载。
- 不同论文 ID、多个 PDF 版本或多个主文件发生歧义时停止，不猜测；可以通过“查看下载状态”查看错误。
- 重复通知合并处理，同版本缓存可复用；下载串行进行，请求至少间隔 3.2 秒。
- 下载失败不妨碍原来的文献保存，可以从菜单手动重试。
- 不执行或编译下载的 TeX；源码归档限制为 50 MiB 压缩数据、200 MiB 展开数据、3000 个文件，并拒绝越界路径和链接。

## 开发与测试

需要 Python 3.12+、Node 24+。构建脚本使用 Python 标准库，按系统和架构下载固定版本的 esbuild、fflate，并校验 npm 包完整性。默认测试不联网、不访问真实 Zotero 文献库。

```sh
git clone https://github.com/zeya-labs/zotero-arxiv-source-helper.git
cd zotero-arxiv-source-helper
python build.py
npm test
```

安装包生成在 `dist/`，同时生成校验文件和匹配的 `updates.json`。构建脚本支持 Windows、macOS、Linux 的 x64 / arm64；目前只验证了 Windows x64。格式检查需要额外执行 `npm install` 和 `npm run format:check`。

```text
bootstrap.js        Zotero 插件生命周期入口
manifest.json       插件版本、兼容性和更新地址
src/core.ts         版本识别、阅读版生成、任务队列
src/runtime.ts      Zotero 事件、附件导入和本地查询接口
src/vendor/         复用的 TeX 解析、存储组件
tests/              源码解析、安装包、模拟 Zotero 工作流测试
query.mjs           AI 使用的本地只读客户端
build.py            构建、打包、生成更新清单
```

可用 `ARXIV_SOURCE_FIXTURE` 指向本地的《Ask to Evolve》`2610.39446v1` 源码包运行额外验证。论文文件不包含在仓库中。提交和发布流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 已知限制

自定义宏可能保留为原始命令；作者注释、未使用的命令不应当作最终正文。图形仍需结合 PDF 或源图像阅读。未支持的归档、模糊主文件和缺失源码会报告失败。当前源码查询接口不提供图像检索。

## 来源与许可证

TeX 解析和存储组件复用自 [Asianfleet/mineru-for-zotero](https://github.com/Asianfleet/mineru-for-zotero)，本项目增加自动保存流程、版本检查、阅读副本和独立运行入口，并修正根目录引用的解析。详细来源和修改见 [THIRD_PARTY.md](THIRD_PARTY.md)。

本项目为 **AGPL-3.0-or-later**，fflate 为 MIT。见 [LICENSE](LICENSE) 和 [FFLATE-LICENSE](FFLATE-LICENSE)。本项目独立维护，不代表 Zotero、arXiv 或 MinerU 官方。
