(function() {
  // Scroll progress bar
  var bar = document.createElement('div');
  bar.id = 'scroll-progress';
  document.body.prepend(bar);

  // Ambient orb
  var orb = document.createElement('div');
  orb.id = 'theme-orb';
  document.body.appendChild(orb);

  // Add scroll hint to hero if on home page
  var hero = document.querySelector('.home-info');
  if (hero) {
    var hint = document.createElement('div');
    hint.className = 'scroll-hint';
    hint.textContent = 'scroll';
    hero.appendChild(hint);
  }

  var voyageMode = false;
  var TRANSITION_START = 0.35; // % of page where voyage starts bleeding in
  var TRANSITION_END   = 0.65; // % of page fully voyage

  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

  function onScroll() {
    var scrolled = window.scrollY;
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;

    var progress = scrolled / maxScroll;

    // Progress bar
    bar.style.width = (progress * 100) + '%';

    // Phase blend 0=veil, 1=voyage
    var phase = Math.max(0, Math.min(1,
      (progress - TRANSITION_START) / (TRANSITION_END - TRANSITION_START)
    ));

    // Toggle body class at midpoint
    if (phase > 0.5 && !voyageMode) {
      document.body.classList.add('voyage-mode');
      voyageMode = true;
    } else if (phase <= 0.5 && voyageMode) {
      document.body.classList.remove('voyage-mode');
      voyageMode = false;
    }

    // Orb visibility and colour
    if (progress > 0.05 && progress < 0.95) {
      orb.style.opacity = String(Math.min(phase * 0.6, 0.5));
    } else {
      orb.style.opacity = '0';
    }

    // Interpolate nav border colour
    var nav = document.querySelector('.nav');
    if (nav) {
      var r = Math.round(lerp(212, 24,  phase));
      var g = Math.round(lerp(83,  95,  phase));
      var b = Math.round(lerp(126, 165, phase));
      nav.style.borderBottomColor = 'rgba(' + r + ',' + g + ',' + b + ',0.25)';
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load
})();
