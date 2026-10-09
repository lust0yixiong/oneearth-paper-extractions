# 论文抽取浏览

这是一个静态网页，整理多篇论文的 JSON 抽取字段。打开 `index.html`，可通过左侧列表搜索和切换论文，并在抽取字段、英文原文 PDF、中文译文之间切换。

公开访问：[论文抽取浏览网站](https://lust0yixiong.github.io/oneearth-paper-extractions/)

## 快速导入新论文

在本仓库目录打开终端，把命令中的路径换成新 JSON 的实际路径：

```bash
python3 scripts/import_papers.py "/完整路径/新论文.pdf.json" --publish
```

也可以一次导入整个文件夹中的全部 `.json`：

```bash
python3 scripts/import_papers.py "/完整路径/新论文文件夹" --publish
```

脚本会自动生成抽取字段页、更新左侧论文列表，并将改动推送到 GitHub。它需要本机已登录并有该仓库的推送权限。文件名如果采用 `编号_10.xxxx_论文DOI后半部分.pdf.json` 格式，脚本会自动识别编号和 DOI；其他文件名也可以导入，但请在 JSON 的 `paper_identity.doi` 中填写 DOI。

若有英文原文 PDF 和中文译文 HTML，可同一次导入：

```bash
python3 scripts/import_papers.py "/完整路径/新论文.pdf.json" --pdf "/完整路径/原文.pdf" --zh "/完整路径/译文.html" --category "领域名称" --zh-title "中文标题" --publish
```

批量导入时，脚本也会在每个 JSON 旁边查找同名 PDF，以及 `编号_zh.html` 格式的译文。缺少配套文件时，论文的相应阅读按钮会停用，字段页仍可正常查看。以后补齐文件时，用相同 JSON 再导入一次即可。已有编号对应另一篇论文时，脚本会阻止覆盖；确认要覆盖后再加 `--replace`。

不加 `--publish` 只会更新本地网站。发布后通常等待 GitHub Pages 完成构建，再刷新公开网站。

网站内容包括：

- `paper_cases/`：逐篇抽取字段页面，完整嵌入相应 JSON 的字段与文本。
- `paper_pdfs/` 与根目录的 `acp-21-10413-2021.pdf`：英文原文 PDF。
- `paper_translations/` 与根目录的 `paper_2906_zh.html`：中文阅读版。
- `paper_figures/`：现有北极气溶胶论文中文阅读版所用图表。
- `paper_pdf_viewer.html` 与 `vendor/pdfjs/`：公开网站的页内 PDF 阅读器，使用 Mozilla PDF.js（Apache 2.0）。

中文译文为机器初译。专业术语、数值、图表和公式应以英文原文为准。论文著作权属于原作者和出版方；请通过页面所列 DOI 查阅原始出版信息与授权条款。
