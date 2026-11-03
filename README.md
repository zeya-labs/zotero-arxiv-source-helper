# arXiv Source Helper for Zotero

保存 arXiv 的原始 TeX 源码，并通过 **LaTeXML / ar5ivist** 生成正文、图表、公式连续排列的 HTML 阅读版。手写 TeX→HTML 渲染器已移除；源码检索与文件位置查询保留。

**本分支为 0.2.0 开发版，尚未发布。Ask to Evolve 实测未通过，请继续保留现有阅读版。** 官方固定镜像及较旧镜像均出现异常退出，新版上游代码对照也未完成转换，不能据此宣称该论文已支持。详见 [实际验证记录](docs/LATEXML-VALIDATION.md)。主分支的 0.1.7 不会收到本分支的自动更新。

## 转换方式

插件解包原始源码，在本机 Docker 容器中运行官方 ar5ivist（内部使用 LaTeXML）。TeX 宏、文档类、公式、图表及交叉引用由上游引擎处理。插件只检查诊断信息、解析引擎产出的 HTML、内嵌本地图片和样式，生成离线阅读文件；不再自己解释 TeX 排版。

图表保留引擎生成的正文位置。不会将整篇 PDF 截图，也不会把图表移到独立展示区。LaTeXML 仍可能遇到不支持的类或宏包，不保证适用于所有论文。

## 本地开发试用

需要 Zotero 10、Node 24+、Python 3.12+，以及已启动、支持 Linux 容器的 Docker Desktop。固定官方镜像约占 8.4 GB 磁盘，首次需下载。

```sh
python build.py
npm test
npm run check
```

构建结果在 `dist/`。这是开发测试包，尚未在独立 Zotero 配置中完成安装与 Connector 端到端验证，不建议替换日常使用版本。

测试包安装后，工具菜单中的 **arXiv Source Helper → 准备 LaTeXML 转换环境（下载镜像）** 下载固定镜像。选择条目后执行 **下载源码并生成阅读版**；随后可从 **查看选中文献转换报告** 查看结果。若找不到 Docker，可通过 Zotero 高级配置的 `extensions.arxivSourceHelper.dockerPath` 指定 Docker 可执行文件的完整路径。

## 失败处理

原始源码附件先保存。转换成功且通过检查后，才更新 TeX 阅读版；引擎退出失败、报告 Error/Fatal、缺图片、存在错误节点或未解析引用时，保留原阅读版，记录失败和日志。警告单独记在报告中，成功状态不意味着已经人工核对全部内容。

源码转换在无网络、只读容器根目录中执行，只挂载当前文献的独立工作目录；不挂载 Zotero 文献库或 Docker 控制接口。归档拒绝越界路径和链接，限制压缩及展开大小。查看生成 HTML 不加载远程图片、脚本、样式或字体。

## 不依赖 Zotero 的真实转换测试

同一个生产转换模块也可从命令行调用：

```sh
node scripts/convert.mjs /path/to/source.gz /path/to/result "Paper title" 2610.39446v1
```

输出 `report.json` 和独立工作目录（含原始源码、引擎日志）；只有通过检查才输出 `reading.html`。同一输出目录再次测试失败时会保留之前成功的 HTML，务必以本次报告状态为准。可选 `--image=latexml/ar5ivist@sha256:...` 仅用于固定官方镜像的版本对照。

## 给 AI 读取

只读查询保留源码中的文件和行位置，不依赖 HTML 转换成功：

```sh
node query.mjs ABCD1234 headings
node query.mjs ABCD1234 section "Active Interaction"
node query.mjs ABCD1234 search "privileged"
node query.mjs ABCD1234 table "tab:interaction_memory"
node query.mjs ABCD1234 image "figures/fig01_overview.pdf" --output overview.pdf
node query.mjs ABCD1234 conversion
```

将 `ABCD1234` 替换为 Zotero 父条目编号。LaTeXML 负责阅读版内的图片转换；此分支不再另行生成查询用的 PDF 图源 PNG 预览，已有预览缓存仍可读取。详见 [本地接口](docs/LOCAL-API.md)。

## 开源组件

本项目采用 AGPL-3.0-or-later。原始源码索引与存储复用 [MinerU for Zotero](https://github.com/Asianfleet/mineru-for-zotero) 的相关模块，HTML 转换调用 [ar5ivist](https://github.com/dginev/ar5ivist) 和 [LaTeXML](https://github.com/brucemiller/LaTeXML)。样式使用 ar5iv-css，HTML 处理使用 parse5。组件版本、许可证及修改记录见 [THIRD_PARTY.md](THIRD_PARTY.md)。
