(() => {
  'use strict';

  const REPO = 'lust0yixiong/oneearth-paper-extractions';
  const BASE = `https://api.github.com/repos/${REPO}`;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const form = document.getElementById('import-form');
  const jsonInput = document.getElementById('json-file');
  const preview = document.getElementById('preview');
  const matchBox = document.getElementById('pdf-match');
  const status = document.getElementById('status');
  const guide = document.getElementById('publish-guide');
  const publish = document.getElementById('publish');
  let selectedPaper = null;
  let selectedPdfUrl = null;
  let matchingPromise = Promise.resolve();
  let downloadUrl = null;

  function clearDownload() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    guide.hidden = true;
    guide.replaceChildren();
  }

  function setStatus(message, kind = '') {
    status.className = `status ${kind}`;
    status.textContent = message;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function jsonForScript(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  async function identify(file, identity) {
    const full = file.name.match(/^(\d+)_(10\.\d+)_(.+)\.pdf\.json$/i);
    if (full) return {id: full[1], doi: `${full[2]}/${full[3]}`};
    const numbered = file.name.match(/^(\d+)(?:_|\.|$)/);
    if (numbered) return {id: numbered[1], doi: String(identity.doi || '未提供 DOI')};
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(file.name)));
    return {id: Array.from(digest.slice(0, 5), x => x.toString(16).padStart(2, '0')).join(''), doi: String(identity.doi || '未提供 DOI')};
  }

  async function parsePaper(file) {
    if (!file) throw new Error('请选择抽取结果 JSON。');
    if (file.size > 12 * 1024 * 1024) throw new Error('JSON 超过 12 MB，请使用本地导入脚本。');
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('JSON 格式有误，无法解析。'); }
    const identity = data && data.paper_identity;
    if (!identity || typeof identity !== 'object' || typeof identity.title !== 'string' || !identity.title.trim()) {
      throw new Error('JSON 缺少 paper_identity.title。');
    }
    for (const key of ['datasets', 'variables', 'research_question_decomposition', 'reusable_knowledge_lessons']) {
      if (!Array.isArray(data[key])) throw new Error(`JSON 的 ${key} 应为数组。`);
    }
    return {file, data, ...await identify(file, identity)};
  }

  function showPreview(paper) {
    preview.className = 'preview';
    preview.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = paper.data.paper_identity.title;
    const meta = document.createElement('small');
    meta.textContent = `编号 ${paper.id} · ${paper.doi} · 数据集 ${paper.data.datasets.length} · 变量 ${paper.data.variables.length} · 研究问题 ${paper.data.research_question_decomposition.length}`;
    preview.append(heading, meta);
  }

  function titleSimilarity(left, right) {
    const words = text => new Set(String(text || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    const a = words(left), b = words(right);
    if (!a.size || !b.size) return 0;
    const common = [...a].filter(word => b.has(word)).length;
    return common / Math.max(a.size, b.size);
  }

  function normalizeDoi(value) {
    return String(value || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase();
  }

  function setMatchMessage(message) {
    matchBox.hidden = false;
    matchBox.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = '在线匹配英文原文';
    const note = document.createElement('p');
    note.textContent = message;
    matchBox.append(heading, note);
  }

  async function matchOpenPdf(paper) {
    selectedPdfUrl = null;
    setMatchMessage('正在检索开放获取的论文版本…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      let work;
      if (paper.doi !== '未提供 DOI') {
        const response = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(paper.doi)}`, {signal: controller.signal});
        if (response.status === 404) {
          setMatchMessage('未在 OpenAlex 找到该 DOI。可以继续上传 JSON，或手动附上 PDF。');
          return;
        }
        if (!response.ok) throw new Error(`OpenAlex 查询失败（HTTP ${response.status}）`);
        work = await response.json();
        if (normalizeDoi(work.doi) !== normalizeDoi(paper.doi)) throw new Error('检索结果 DOI 不一致');
      } else {
        const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(paper.data.paper_identity.title)}&per_page=5`, {signal: controller.signal});
        if (!response.ok) throw new Error(`OpenAlex 查询失败（HTTP ${response.status}）`);
        const results = (await response.json()).results || [];
        work = results.sort((a, b) => titleSimilarity(b.display_name, paper.data.paper_identity.title) - titleSimilarity(a.display_name, paper.data.paper_identity.title))[0];
      }
      if (selectedPaper !== paper) return;
      if (!work || titleSimilarity(work.display_name, paper.data.paper_identity.title) < .7) {
        setMatchMessage('检索到的标题与 JSON 不够一致；请手动核对并上传 PDF。');
        return;
      }
      const publisherPdf = normalizeDoi(work.doi).match(/^10\.5194\/([a-z]+)-(\d+)-(\d+)-(\d{4})$/);
      const publisherLocation = publisherPdf && work.best_oa_location?.is_oa ? [{
        is_oa: true,
        pdf_url: `https://${publisherPdf[1]}.copernicus.org/articles/${publisherPdf[2]}/${publisherPdf[3]}/${publisherPdf[4]}/${publisherPdf[1]}-${publisherPdf[2]}-${publisherPdf[3]}-${publisherPdf[4]}.pdf`,
        version: 'publishedVersion',
        source: {display_name: 'Copernicus Publications'}
      }] : [];
      const candidates = [...publisherLocation, work.best_oa_location, work.primary_location, ...(work.locations || [])]
        .filter(item => item?.is_oa && /^https:\/\//i.test(item.pdf_url || '') && !/^https:\/\/(?:dx\.)?doi\.org\//i.test(item.pdf_url))
        .sort((a, b) => (a.version === 'publishedVersion' ? 0 : a.version === 'acceptedVersion' ? 1 : 2) - (b.version === 'publishedVersion' ? 0 : b.version === 'acceptedVersion' ? 1 : 2));
      const unique = [...new Map(candidates.map(item => [item.pdf_url, item])).values()].slice(0, 3);
      if (!unique.length) {
        setMatchMessage('已核对论文标题和 DOI，但未找到可直接使用的开放 PDF 链接。可以手动附上 PDF。');
        return;
      }
      matchBox.hidden = false;
      matchBox.replaceChildren();
      const heading = document.createElement('strong');
      heading.textContent = '找到开放获取的原文候选';
      const note = document.createElement('p');
      note.textContent = `已匹配：${work.display_name}。选择一个来源；若链接不能在页内打开，可在来源网站查看。`;
      matchBox.append(heading, note);
      unique.forEach((item, index) => {
        const row = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'matched-pdf';
        radio.value = item.pdf_url;
        radio.checked = index === 0;
        radio.addEventListener('change', () => { if (radio.checked) selectedPdfUrl = item.pdf_url; });
        const label = document.createElement('span');
        const version = item.version === 'publishedVersion' ? '正式发表版' : item.version === 'acceptedVersion' ? '录用稿' : '预印本';
        label.textContent = `${item.source?.display_name || '开放获取来源'} · ${version}`;
        const link = document.createElement('a');
        link.href = item.pdf_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '核对 PDF ↗';
        row.append(radio, label, ' · ', link);
        matchBox.append(row);
      });
      const none = document.createElement('label');
      none.className = 'none';
      const noRadio = document.createElement('input');
      noRadio.type = 'radio';
      noRadio.name = 'matched-pdf';
      noRadio.value = '';
      noRadio.addEventListener('change', () => { if (noRadio.checked) selectedPdfUrl = null; });
      none.append(noRadio, '暂不使用在线来源');
      matchBox.append(none);
      selectedPdfUrl = unique[0].pdf_url;
    } catch (error) {
      if (selectedPaper === paper) setMatchMessage(`${error.message || '查询失败'}。仍可继续发布 JSON。`);
    } finally {
      clearTimeout(timeout);
    }
  }

  jsonInput.addEventListener('change', async () => {
    clearDownload();
    selectedPaper = null;
    selectedPdfUrl = null;
    matchingPromise = Promise.resolve();
    matchBox.hidden = true;
    setStatus('');
    try {
      selectedPaper = await parsePaper(jsonInput.files[0]);
      showPreview(selectedPaper);
      matchingPromise = matchOpenPdf(selectedPaper);
    } catch (error) {
      preview.className = 'preview error';
      preview.textContent = error.message;
    }
  });

  form.addEventListener('change', event => {
    if (event.target !== jsonInput && downloadUrl) clearDownload();
  });
  for (const id of ['category', 'zh-title']) {
    document.getElementById(id).addEventListener('input', () => {
      if (downloadUrl) clearDownload();
    });
  }

  async function api(path) {
    const response = await fetch(`${BASE}${path}`, {
      headers: {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
      cache: 'no-store'
    });
    let body;
    try { body = await response.json(); }
    catch { throw new Error(`GitHub 返回了无法识别的响应（HTTP ${response.status}）。`); }
    if (!response.ok) {
      const detail = Array.isArray(body.errors) ? body.errors.map(item => item.message || item.code).filter(Boolean).join('；') : '';
      throw new Error(`读取仓库失败（HTTP ${response.status}）：${body.message || detail || '请稍后重试。'}`);
    }
    return body;
  }

  function decodeGitHubFile(response) {
    if (response.encoding !== 'base64' || !response.content) throw new Error('无法读取仓库文件。');
    const binary = atob(response.content.replace(/\s/g, ''));
    return decoder.decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
  }

  async function readOptionalFile(inputId, extension, maxBytes) {
    const file = document.getElementById(inputId).files[0];
    if (!file) return null;
    if (!(extension === '.html' ? /\.html?$/i.test(file.name) : file.name.toLowerCase().endsWith(extension))) {
      throw new Error(`${file.name} 应为 ${extension} 文件。`);
    }
    if (file.size > maxBytes) throw new Error(`${file.name} 文件较大，请使用本地导入脚本。`);
    if (extension === '.pdf') {
      const signature = decoder.decode(await file.slice(0, 5).arrayBuffer());
      if (signature !== '%PDF-') throw new Error(`${file.name} 不是有效的 PDF 文件。`);
    }
    return file;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    publish.disabled = true;
    clearDownload();
    setStatus('正在检查文件…');
    try {
      const paper = selectedPaper && selectedPaper.file === jsonInput.files[0]
        ? selectedPaper : await parsePaper(jsonInput.files[0]);
      await matchingPromise;
      const pdfFile = await readOptionalFile('pdf-file', '.pdf', 25 * 1024 * 1024);
      const zhFile = await readOptionalFile('zh-file', '.html', 10 * 1024 * 1024);

      setStatus('正在读取 GitHub 网站的最新版本…');
      const ref = await api('/git/ref/heads/main');
      const head = ref.object.sha;
      const paths = ['index.html', 'paper_library_manifest.json', 'scripts/case_template.html'];
      const contents = await Promise.all(paths.map(async path => decodeGitHubFile(
        await api(`/contents/${path}?ref=${head}`)
      )));
      const [indexSource, manifestSource, template] = contents;
      const papers = JSON.parse(manifestSource);
      if (!Array.isArray(papers)) throw new Error('网站论文列表格式有误。');
      const existingIndex = papers.findIndex(item => item.id === paper.id);
      const old = existingIndex >= 0 ? papers[existingIndex] : null;
      const title = paper.data.paper_identity.title;
      if (old && old.title !== title) throw new Error(`编号 ${paper.id} 已被另一篇论文使用。请先核对 JSON 文件名。`);

      const category = document.getElementById('category').value.trim() || (old && old.category) || '新增论文';
      const zhTitle = document.getElementById('zh-title').value.trim() || (old && old.zhTitle) || title;
      const pdfPath = pdfFile ? `paper_pdfs/${paper.id}.pdf` : selectedPdfUrl || (old && old.pdf) || null;
      const zhPath = zhFile ? `paper_translations/${paper.id}.html` : (old && old.zh) || null;
      const record = {
        id: paper.id, category,
        doi: paper.doi === '未提供 DOI' && old ? old.doi : paper.doi,
        title, extraction: `paper_cases/${paper.id}.html`,
        pdf: pdfPath, zh: zhPath,
        datasets: paper.data.datasets.length,
        variables: paper.data.variables.length,
        questions: paper.data.research_question_decomposition.length,
        zhTitle
      };
      if (old) papers[existingIndex] = record;
      else papers.push(record);

      for (const marker of ['__PAPER_TITLE__', '__SOURCE_FILENAME__', '__DATA_JSON__']) {
        if (!template.includes(marker)) throw new Error('字段页模板不完整。');
      }
      const casePage = template
        .replace('__PAPER_TITLE__', escapeHtml(title))
        .replace('__SOURCE_FILENAME__', escapeHtml(paper.file.name))
        .replace('__DATA_JSON__', jsonForScript(paper.data));
      const match = /const PAPERS=.*?;\n/s;
      if (!match.test(indexSource)) throw new Error('网站首页未找到论文列表。');
      const indexPage = indexSource.replace(match, () => `const PAPERS=${jsonForScript(papers)};\n`);
      const additions = [
        {path: `paper_cases/${paper.id}.html`, bytes: encoder.encode(casePage)},
        {path: 'paper_library_manifest.json', bytes: encoder.encode(JSON.stringify(papers, null, 2) + '\n')},
        {path: 'index.html', bytes: encoder.encode(indexPage)}
      ];
      if (pdfFile) additions.push({path: pdfPath, bytes: new Uint8Array(await pdfFile.arrayBuffer())});
      if (zhFile) additions.push({path: zhPath, bytes: new Uint8Array(await zhFile.arrayBuffer())});

      setStatus('正在生成发布文件…');
      const zip = window.makePaperImportZip(additions);
      const download = URL.createObjectURL(zip);
      downloadUrl = download;
      const name = `paper-import-${paper.id}.zip`;
      const link = document.createElement('a');
      link.href = download;
      link.download = name;
      link.textContent = `下载 ${name}`;
      setStatus('发布文件已生成。下载后，在 GitHub 登录并提交。', 'success');
      guide.hidden = false;
      const guideTitle = document.createElement('strong');
      guideTitle.textContent = `发布包：${name}`;
      const steps = document.createElement('ol');
      for (const step of [
        '点击下方“下载发布包”，再解压 ZIP 文件。',
        '点击下方链接，按需登录 GitHub。',
        '把解压后文件夹内的全部文件和文件夹拖入 GitHub 上传区，确认提交。'
      ]) {
        const item = document.createElement('li');
        item.textContent = step;
        steps.append(item);
      }
      const upload = document.createElement('a');
      upload.href = 'https://github.com/lust0yixiong/oneearth-paper-extractions/upload/main';
      upload.target = '_blank';
      upload.rel = 'noopener noreferrer';
      upload.textContent = '登录 GitHub 并上传发布文件 ↗';
      const note = document.createElement('small');
      note.textContent = '只有拥有仓库写入权限的账号可以提交；提交后等待 GitHub Pages 更新。若期间有人更新论文列表，请重新生成发布包。';
      guide.append(guideTitle, steps, link, ' · ', upload, note);
    } catch (error) {
      setStatus(error.message || '导入失败，请重试。', 'error');
    } finally {
      publish.disabled = false;
    }
  });
})();
