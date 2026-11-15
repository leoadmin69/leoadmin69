// Widget à intégrer sur n'importe quel site :
// <script src="https://TON-IA/widget.js" data-key="nova_…" data-title="Assistant" data-color="#c4623a" defer></script>
(function () {
  var s = document.currentScript;
  var base = new URL(s.src).origin;
  var key = s.getAttribute('data-key') || '';
  var color = s.getAttribute('data-color') || 'linear-gradient(135deg,#1fd5f5,#7c5cff)';
  var title = s.getAttribute('data-title') || 'Assistant';
  var open = false;
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', title);
  btn.textContent = '✦';
  btn.style.cssText = 'position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;z-index:2147483646;' +
    'background:' + color + ';color:#fff;font-size:24px;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  var frame = document.createElement('iframe');
  frame.title = title;
  frame.allow = 'microphone; autoplay';
  frame.style.cssText = 'position:fixed;right:20px;bottom:88px;width:min(400px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));border:0;' +
    'border-radius:16px;box-shadow:0 0 0 1px rgba(77,232,255,.35),0 10px 50px rgba(77,232,255,.25);z-index:2147483646;display:none;background:#04060c';
  btn.onclick = function () {
    if (!frame.src) frame.src = base + '/?embed=1' + (key ? '&key=' + encodeURIComponent(key) : '');
    open = !open;
    frame.style.display = open ? 'block' : 'none';
    btn.textContent = open ? '×' : '✦';
  };
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
