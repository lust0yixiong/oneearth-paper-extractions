(() => {
  const raw = new URLSearchParams(location.search).get('url');
  let url;
  try { url = new URL(raw); }
  catch { document.querySelector('.card p').textContent = '原文链接无效。'; return; }
  if (url.protocol !== 'https:' || url.username || url.password) {
    document.querySelector('.card p').textContent = '原文链接无效。';
    return;
  }
  document.getElementById('source').href = url.href;
  document.getElementById('open-source').href = url.href;
  document.getElementById('open-browser').href = url.href;
  const frame = document.getElementById('original');
  document.getElementById('preview').addEventListener('click', () => {
    frame.src = url.href;
    frame.hidden = false;
    document.getElementById('notice').hidden = true;
    document.getElementById('back').hidden = false;
  });
  document.getElementById('back').addEventListener('click', () => {
    frame.hidden = true;
    frame.src = 'about:blank';
    document.getElementById('notice').hidden = false;
    document.getElementById('back').hidden = true;
  });
})();
