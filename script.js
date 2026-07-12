(() => {
  'use strict';
  document.getElementById('year').textContent = new Date().getFullYear();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let particles = [], width = 0, height = 0, frame = 0;
  const density = () => Math.min(48, Math.max(18, Math.round(innerWidth / 30)));

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: density() }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      r: Math.random() * 1.1 + .25, speed: Math.random() * .12 + .035,
      drift: (Math.random() - .5) * .08, alpha: Math.random() * .5 + .12
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.y -= p.speed; p.x += p.drift;
      if (p.y < -3) { p.y = height + 3; p.x = Math.random() * width; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(224, 194, 105, ${p.alpha})`; ctx.fill();
    }
    frame = requestAnimationFrame(draw);
  }

  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame); else draw();
  });
  resize(); draw();
})();
