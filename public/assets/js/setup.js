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
    const mb = bytes / (1024 * 1024);
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
        nodemcu: pick(/^(ino|bin)$/i, /coin ?box|nodemcu|esp8266/i)
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

initGuideToc();
initGuideDownloads();
