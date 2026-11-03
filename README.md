# arXiv Source Helper for Zotero

保存 arXiv 的 TeX 源码，并生成图表随正文排列、文字可选择和检索的 **TeX 阅读版**。

正文按照主文件的 `\input` / `\include` 顺序展开。遇到 figure 就显示对应图片和图注，遇到 table 就显示表格；公式在本地排版。PDF 图源转换为 PNG，正文保留为 HTML 文字。不会把整篇论文 PDF 逐页截图，也没有单独的图片或表格集中区。

浏览器照常使用 Zotero Connector，无需模型密钥或 MinerU 密钥。源码从 arXiv 下载，不上传 PDF。

**当前为预览版，要求 Zotero 10。** 已在 Windows / Zotero 10.0.7 中生成《Ask to Evolve》的正文、14 幅图和 7 张表，并完成实际附件导入。当前 XPI 的安装、Connector 自动触发和其他系统仍需验证，详见 [验证记录](docs/VALIDATION.md)。

## 安装

1. 在 [Releases](https://github.com/zeya-labs/zotero-arxiv-source-helper/releases) 下载 **0.1.7 或更新版**的 `.xpi`。
2. 在 Zotero 打开 **Tools / 工具 → Plugins / 插件 → 齿轮 → Install Add-on From File / 从文件安装插件**，选择安装包并重启。
3. 工具菜单中应出现 **arXiv Source Helper**。

直接覆盖旧版即可，不需要卸载或修改 Zotero Connector。0.1.4–0.1.6 的整页 PDF 阅读版已被 TeX 正文阅读版取代。

## 使用

- **新文献：** 在 arXiv 页面用 Zotero Connector 保存，插件自动补充源码与阅读版。
- **已有文献：** 选中文献，点击 **工具 → arXiv Source Helper → 下载源码并生成阅读版**。菜单内可查看任务状态和开关自动下载。
- **升级已有副本：** 再执行一次生成。插件复用缓存的源码和图源，更新旧附件并恢复“TeX 阅读版”标题。

每篇文献会增加两个附件：

| 附件                    | 内容                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| arXiv TeX 阅读版 · IDvN | 连续 HTML 正文、原位图表、公式、文内跳转和目录；图表旁可展开原始 TeX 核对 |
| arXiv 原始源码 · IDvN   | arXiv 返回的原始源码包，包括 TeX 和图片等素材                             |

阅读版是一个自包含 HTML，内嵌图片、公式样式与字体，打开时无需联网。普通附件可使用 Zotero 文件同步；解包查询缓存属于本机数据，换电脑后可重新生成。插件不自动扫描整个旧文献库。

## 给 AI 读取

`query.mjs` 是只读客户端，需要 Node 24+ 和正在运行的 Zotero。将示例中的 `ABCD1234` 换成父条目的 Zotero 编号：

```sh
node query.mjs ABCD1234 headings
node query.mjs ABCD1234 section "Active Interaction"
node query.mjs ABCD1234 search "privileged"
node query.mjs ABCD1234 table "tab:interaction_memory"
node query.mjs ABCD1234 figures
node query.mjs ABCD1234 images
node query.mjs ABCD1234 image "figures/fig01_overview.pdf" --preview --output overview.png
node query.mjs ABCD1234 full
```

章节、搜索结果、图表查询携带源文件位置。先查目录，再读章节或表格，可避免一次传入全部源码。表格查询保留原始 TeX；图片查询可导出原图或 PNG 预览。查询不会隐式触发下载。详情见 [本地查询接口](docs/LOCAL-API.md)。

## 限制与下载行为

- 这是 TeX 到 HTML 的阅读转换，不是完整 LaTeX 编译器。支持常见章节、文字样式、公式、列表、图片与 tabular / tabularx 表格；特殊宏可能保留为可见源码，复杂表格可展开原始 TeX 核对。
- 图表使用 TeX 定义位置的顺序，不模拟排版器将浮动图表移到其他页的行为。PDF 图源默认预览第一页，原图下载保留完整文件；EPS 暂无 PNG 预览。
- 使用固定 arXiv 版本；条目 ID、版本或主文件有歧义时停止并显示错误。
- 重复通知合并，下载串行进行，请求至少间隔 3.2 秒；失败可从菜单重试。
- 不执行或编译下载的 TeX。归档限制为 50 MiB 压缩数据、200 MiB 展开数据、3000 个文件，拒绝越界路径与链接。

## 开发与验证

需要 Python 3.12+ 和 Node 24+：

```sh
git clone https://github.com/zeya-labs/zotero-arxiv-source-helper.git
cd zotero-arxiv-source-helper
python build.py
npm test
npm run check
```

构建脚本下载固定版本的 esbuild、fflate、PDF.js 和 KaTeX，并校验 npm 包 SHA-512。数学字体在构建时嵌入；安装包和校验文件输出到 `dist/`，同时生成匹配的 `updates.json`。格式检查可安装开发依赖后运行 `npm run format:check`。

默认测试不联网、不使用真实文献库。可设置 `ARXIV_SOURCE_FIXTURE` 运行本地真实源码包测试；有 Playwright 时，使用 `tests/render-source.mjs SOURCE.gz OUTPUT_DIR` 验证整份 HTML 的源顺序、图片、表格、公式和离线加载，设置 `ASH_BROWSER_MODULE` 指向 Playwright。论文源码与生成样例不提交到仓库。

构建支持 Windows、macOS、Linux 的 x64 / arm64；目前仅实测 Windows x64。贡献与发布流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 来源与许可证

TeX 解析与存储组件复用自 [Asianfleet/mineru-for-zotero](https://github.com/Asianfleet/mineru-for-zotero)。本项目独立维护，不代表 Zotero、arXiv 或 MinerU 官方。

项目为 **AGPL-3.0-or-later**；fflate 和 KaTeX 为 MIT，PDF.js 为 Apache-2.0。来源、固定版本与本地修改见 [THIRD_PARTY.md](THIRD_PARTY.md)。
