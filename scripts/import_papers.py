#!/usr/bin/env python3
"""Import paper extraction JSON files into the static GitHub Pages library."""

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


SITE = Path(__file__).resolve().parent.parent
MANIFEST = SITE / "paper_library_manifest.json"
INDEX = SITE / "index.html"
TEMPLATE = SITE / "scripts" / "case_template.html"
SITE_URL = "https://lust0yixiong.github.io/oneearth-paper-extractions/"
REQUIRED_LISTS = (
    "datasets",
    "variables",
    "research_question_decomposition",
    "reusable_knowledge_lessons",
)


def run_git(*args):
    return subprocess.run(
        ["git", *args], cwd=SITE, check=True, text=True, capture_output=True
    ).stdout.strip()


def json_for_script(value):
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def input_files(paths):
    files = []
    for raw in paths:
        path = Path(raw).expanduser().resolve()
        if path.is_dir():
            files.extend(sorted(path.glob("*.json")))
        elif path.is_file() and path.suffix.lower() == ".json":
            files.append(path)
        else:
            raise ValueError(f"不是 JSON 文件或包含 JSON 的文件夹：{raw}")
    files = list(dict.fromkeys(files))
    if not files:
        raise ValueError("没有找到 JSON 文件")
    return files


def paper_id_and_doi(path, identity):
    name = path.name
    match = re.match(r"^(\d+)_(10\.\d+)_(.+)\.pdf\.json$", name, re.I)
    if match:
        return match.group(1), f"{match.group(2)}/{match.group(3)}"
    paper_id = re.match(r"^(\d+)(?:_|\.|$)", name)
    if paper_id:
        return paper_id.group(1), str(identity.get("doi") or "未提供 DOI")
    digest = hashlib.sha256(name.encode("utf-8")).hexdigest()[:10]
    return digest, str(identity.get("doi") or "未提供 DOI")


def optional_asset(json_path, explicit, kind, paper_id):
    if explicit:
        asset = Path(explicit).expanduser().resolve()
        if not asset.is_file():
            raise ValueError(f"找不到{kind}文件：{explicit}")
        return asset
    if kind == "PDF":
        candidates = (json_path.with_suffix(""), json_path.parent / f"{paper_id}.pdf")
    else:
        candidates = (
            json_path.parent / f"{paper_id}_zh.html",
            json_path.parent / f"{paper_id}.zh.html",
        )
    return next((p for p in candidates if p.is_file()), None)


def prepare(path, args):
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取 JSON：{path}\n{exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("paper_identity"), dict):
        raise ValueError(f"缺少 paper_identity 对象：{path}")
    identity = data["paper_identity"]
    title = identity.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError(f"缺少 paper_identity.title：{path}")
    for key in REQUIRED_LISTS:
        if not isinstance(data.get(key), list):
            raise ValueError(f"{path} 的 {key} 应为数组")
    paper_id, doi = paper_id_and_doi(path, identity)
    pdf = optional_asset(path, args.pdf, "PDF", paper_id)
    zh = optional_asset(path, args.zh, "中文译文", paper_id)
    if pdf and pdf.suffix.lower() != ".pdf":
        raise ValueError(f"PDF 文件扩展名应为 .pdf：{pdf}")
    if zh and zh.suffix.lower() not in (".html", ".htm"):
        raise ValueError(f"中文译文应为 HTML 文件：{zh}")
    return path, data, paper_id, doi, pdf, zh


def main():
    parser = argparse.ArgumentParser(
        description="导入论文 JSON，生成字段页并更新网站论文列表。"
    )
    parser.add_argument("paths", nargs="+", help="一个或多个 JSON 文件，或存放 JSON 的文件夹")
    parser.add_argument("--pdf", help="英文原文 PDF；仅适用于单个 JSON")
    parser.add_argument("--zh", help="中文译文 HTML；仅适用于单个 JSON")
    parser.add_argument("--category", default="新增论文", help="左侧列表显示的领域")
    parser.add_argument("--zh-title", help="左侧列表显示的中文标题；仅适用于单个 JSON")
    parser.add_argument("--replace", action="store_true", help="允许更新已有编号的论文")
    parser.add_argument("--publish", action="store_true", help="提交并推送至 GitHub Pages")
    args = parser.parse_args()

    files = input_files(args.paths)
    if len(files) != 1 and (args.pdf or args.zh or args.zh_title):
        raise ValueError("批量导入时，请把配套文件放在 JSON 旁边并按编号命名")
    prepared = [prepare(path, args) for path in files]
    ids = [item[2] for item in prepared]
    if len(ids) != len(set(ids)):
        raise ValueError("待导入文件中有重复论文编号，请检查文件名")

    if args.publish:
        if run_git("status", "--porcelain"):
            raise ValueError("网站目录有尚未提交的改动；请先处理这些改动再发布")
        run_git("pull", "--ff-only", "origin", "main")

    papers = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_id = {paper["id"]: i for i, paper in enumerate(papers)}
    for path, data, paper_id, doi, pdf, zh in prepared:
        old = papers[by_id[paper_id]] if paper_id in by_id else None
        if old and old["title"] != data["paper_identity"]["title"] and not args.replace:
            raise ValueError(
                f"编号 {paper_id} 已属于另一篇论文；确认后可加 --replace 覆盖"
            )

        case = TEMPLATE.read_text(encoding="utf-8")
        case = case.replace("__PAPER_TITLE__", html.escape(data["paper_identity"]["title"]))
        case = case.replace("__SOURCE_FILENAME__", html.escape(path.name))
        case = case.replace("__DATA_JSON__", json_for_script(data))
        case_path = SITE / "paper_cases" / f"{paper_id}.html"
        case_path.parent.mkdir(exist_ok=True)
        case_path.write_text(case, encoding="utf-8")

        pdf_rel = old.get("pdf") if old else None
        zh_rel = old.get("zh") if old else None
        if pdf:
            pdf_rel = f"paper_pdfs/{paper_id}.pdf"
            target = SITE / pdf_rel
            target.parent.mkdir(exist_ok=True)
            if pdf != target:
                shutil.copy2(pdf, target)
        if zh:
            zh_rel = f"paper_translations/{paper_id}.html"
            target = SITE / zh_rel
            target.parent.mkdir(exist_ok=True)
            if zh != target:
                shutil.copy2(zh, target)

        paper = {
            "id": paper_id,
            "category": args.category if not old or args.category != "新增论文" else old["category"],
            "doi": doi if doi != "未提供 DOI" or not old else old["doi"],
            "title": data["paper_identity"]["title"],
            "extraction": f"paper_cases/{paper_id}.html",
            "pdf": pdf_rel,
            "zh": zh_rel,
            "datasets": len(data["datasets"]),
            "variables": len(data["variables"]),
            "questions": len(data["research_question_decomposition"]),
            "zhTitle": args.zh_title or (old.get("zhTitle") if old else None) or data["paper_identity"]["title"],
        }
        if old:
            papers[by_id[paper_id]] = paper
            print(f"已更新：{paper_id} {paper['title']}")
        else:
            by_id[paper_id] = len(papers)
            papers.append(paper)
            print(f"已导入：{paper_id} {paper['title']}")
        if not pdf or not zh:
            missing = "、".join(x for x, present in (("英文 PDF", pdf_rel), ("中文译文", zh_rel)) if not present)
            if missing:
                print(f"  尚未添加：{missing}；相应阅读按钮会停用")
        print(f"  {SITE_URL}#paper={paper_id}&view=extraction")

    MANIFEST.write_text(json.dumps(papers, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")
    index, count = re.subn(
        r"const PAPERS=.*?;\n",
        lambda _: "const PAPERS=" + json_for_script(papers) + ";\n",
        index,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise ValueError("无法找到网站论文列表，请检查 index.html")
    INDEX.write_text(index, encoding="utf-8")
    print(f"论文总数：{len(papers)}")

    if args.publish:
        run_git("add", "-A")
        if not run_git("status", "--porcelain"):
            print("网站没有变化，无需重新发布")
        else:
            run_git("commit", "-m", f"Import {len(prepared)} paper extraction(s)")
            run_git("push", "origin", "main")
            print(f"已发布：{SITE_URL}")
    else:
        print("网页已在本地更新。加 --publish 可同步到 GitHub 网站。")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"导入失败：{error}", file=sys.stderr)
        sys.exit(1)
