// navbar 当前栏目高亮 + 滑动指示条
// 关键设计:
// 1. 指示条挂在 <body> 上 fixed 定位——Mintlify 路由跳转会重建导航栏 DOM,
//    放在导航栏内部会被销毁,滑动动画就变成"消失再出现"。
// 2. 捕获阶段监听点击并乐观滑动——点击瞬间就开始滑,不等路由完成。
// 3. 多个链接指向同一栏目时(如 CI/CD&GitOps 与自动化运维),
//    记住最近点击的链接(preferredHref),高亮和指示条跟着它走。
(function () {
  var SHRINK = 10; // 指示条两侧内缩,聚焦在文字与图标区域
  var BAR_H = 3;
  var indicator = null;
  var optimisticLi = null;
  var optimisticUntil = 0;
  var preferredText = null;
  try {
    preferredText = sessionStorage.getItem('navbar-preferred-label');
  } catch (e) {}

  function ensureIndicator() {
    if (!indicator || !indicator.isConnected) {
      indicator = document.createElement('div');
      indicator.className = 'navbar-indicator';
      document.body.appendChild(indicator);
    }
    return indicator;
  }

  // 同一路径段下如有多个候选链接,优先选最近点击过的那个(按文字区分)
  function pickCandidate(candidates) {
    if (preferredText) {
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].textContent.trim() === preferredText) return candidates[i];
      }
    }
    return candidates[0];
  }

  // 按当前路径找可见的选中项 <li>,并给每份导航副本标记 active 类
  function findActiveLi() {
    var current = window.location.pathname.split('/')[1] || '';
    var found = null;
    var uls = document.querySelectorAll('#navbar nav[aria-label="Main"] > ul');
    for (var i = 0; i < uls.length; i++) {
      var lis = uls[i].querySelectorAll('.navbar-link');
      var candidates = [];
      for (var j = 0; j < lis.length; j++) {
        var a = lis[j].querySelector('a[href^="/"]');
        lis[j].classList.remove('navbar-link-active');
        if (!a) continue;
        var seg = a.getAttribute('href').split('/')[1] || '';
        if (seg !== '' && seg === current) candidates.push(lis[j]);
      }
      if (candidates.length) {
        var chosen = pickCandidate(candidates);
        chosen.classList.add('navbar-link-active');
        if (!found && chosen.offsetWidth > 0) found = chosen;
      }
    }
    return found;
  }

  function moveIndicator(li) {
    var ind = ensureIndicator();
    if (!li) {
      ind.style.opacity = '0';
      return;
    }
    var rect = li.getBoundingClientRect();
    ind.style.left = (rect.left + SHRINK) + 'px';
    ind.style.top = (rect.bottom - BAR_H + 1) + 'px'; // 贴住导航栏底边
    ind.style.width = Math.max(rect.width - SHRINK * 2, 0) + 'px';
    ind.style.opacity = '1';
  }

  function update() {
    // 乐观期内:点击目标还在就跟着它,不在才按路径重新计算
    if (optimisticLi && Date.now() < optimisticUntil) {
      if (optimisticLi.isConnected && optimisticLi.offsetWidth > 0) {
        moveIndicator(optimisticLi);
        return;
      }
      optimisticLi = null; // 旧 DOM 已被 React 替换,提前结束乐观期
    }
    moveIndicator(findActiveLi());
  }

  update();
  window.addEventListener('popstate', update);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, { passive: true });

  // 捕获阶段监听:防止站内脚本在冒泡阶段拦截导致收不到
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('#navbar .navbar-link > a[href^="/"]');
    if (!a) return;
    var li = a.closest('.navbar-link');
    optimisticLi = li;
    optimisticUntil = Date.now() + 700; // 乐观期覆盖一次客户端路由跳转
    preferredText = a.textContent.trim(); // 记住点击项文字,同栏目多链接时跟着它
    try {
      sessionStorage.setItem('navbar-preferred-label', preferredText);
    } catch (err) {}
    moveIndicator(li); // 点击瞬间立即开始滑动
    [750, 1000].forEach(function (t) {
      setTimeout(update, t); // 乐观期结束后校准到真实选中项
    });
  }, true);

  setInterval(update, 300); // SPA 路由与布局变化兜底
})();
