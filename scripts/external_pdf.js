(() => {
  const raw = new URLSearchParams(location.search).get('url');
  let url;
  try { url = new URL(raw); }
  catch { document.querySelector('p').textContent = '原文链接无效。'; return; }
  if (url.protocol !== 'https:' || url.username || url.password) {
    document.querySelector('p').textContent = '原文链接无效。';
    return;
  }
  document.getElementById('source').href = url.href;
  document.getElementById('original').src = url.href;
})();
