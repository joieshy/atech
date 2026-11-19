'use strict';

/* TOC active state habang nag-i-scroll */
function initGuideToc() {
  const links = Array.from(document.querySelectorAll('.guide-toc a'));
  const blocks = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if (!blocks.length) return;

  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: '-96px 0px -55% 0px', threshold: 0 }
  );

  blocks.forEach((block) => observer.observe(block));
  if (location.hash) setActive(location.hash.slice(1));
}

/* Direktang download link depende sa file type ng installer */
function initGuideDownloads() {
  const formatSize = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
  };

  fetch('/api/installers')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.installers)) return;
      const list = data.installers;
      const pick = (pattern, titlePattern) =>
        list.find(
          (item) =>
            pattern.test(item.fileType || '') || (titlePattern && titlePattern.test(item.title || ''))
        );
      const matches = {
        minipc: pick(/^iso$/i),
        orangepi: pick(/^(xz|img|gz)$/i),
        nodemcu: pick(/^(ino|bin)$/i, /coin ?box|nodemcu|esp8266/i),
        ruijie: pick(/$^/, /ruijie|ew1200|rg-ew/i)
      };

      Object.entries(matches).forEach(([key, item]) => {
        if (!item) return;
        document.querySelectorAll(`[data-download="${key}"]`).forEach((link) => {
          link.href = `/download/${encodeURIComponent(item.slug)}`;
        });
        document.querySelectorAll(`[data-file="${key}"]`).forEach((node) => {
          node.textContent = `${item.title} · ${item.fileType} · ${formatSize(item.fileSize)}`;
        });
      });
    })
    .catch(() => {
      /* offline lang — mananatili ang fallback na /#installers */
    });
}

/* Kapag galing sa home page (#ruijie, #minipc, ...), siguraduhin na tama ang landing. */
function initGuideHash() {
  if (!location.hash) return;

  let target = null;
  try {
    target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {
    return;
  }
  if (!target) return;

  let pinned = true;
  const release = () => {
    pinned = false;
  };
  window.addEventListener('wheel', release, { once: true, passive: true });
  window.addEventListener('touchstart', release, { once: true, passive: true });

  const jump = () => {
    if (!pinned) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 96;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, top));
    root.style.scrollBehavior = previous;
  };

  // Ang browser ay hindi laging naka-scroll agad sa anchor ng bagong page
  // (lalo na habang naglo-load pa ang fonts), kaya pilitin natin.
  window.requestAnimationFrame(jump);
  window.addEventListener('load', () => window.setTimeout(jump, 40), { once: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => window.setTimeout(jump, 40)).catch(() => {});
  }
}

initGuideToc();
initGuideHash();
initGuideDownloads();
