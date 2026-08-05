/* Rico Cell — comportamentos do site.
   Tudo é progressivo: sem JS a página continua legível e navegável. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* — Revelação ao rolar ---------------------------------------------------
     Os blocos nascem visíveis no HTML. Aqui eles são "armados" (escondidos)
     e revelados ao entrar na viewport, então nada fica preso invisível se o
     JS falhar. Quem já está na tela no primeiro quadro não é armado. */
  function setupReveal() {
    var blocks = document.querySelectorAll('.reveal');
    if (!blocks.length || reduceMotion || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });

    blocks.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
      el.classList.add('is-armed');
      observer.observe(el);
    });
  }

  /* — Inclinação 3D dos cards (só mouse fino, sem toque) — */
  function setupTilt() {
    if (reduceMotion) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      el.addEventListener('mousemove', function (ev) {
        var r = el.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width - 0.5;
        var y = (ev.clientY - r.top) / r.height - 0.5;
        el.style.transition = 'transform .08s linear';
        el.style.transform =
          'perspective(900px) rotateY(' + (x * 6).toFixed(2) + 'deg) rotateX(' +
          (-y * 6).toFixed(2) + 'deg) translateY(-4px)';
      });
      el.addEventListener('mouseleave', function () {
        el.style.transition = 'transform .4s cubic-bezier(.22,.61,.36,1)';
        el.style.transform = 'none';
      });
    });
  }

  /* — Seletor de cor dos iPhones -------------------------------------------
     Troca a foto principal e o rótulo do card. Bolinhas "sob consulta"
     (data-mock) escurecem a foto e mostram o selo "foto em breve". */
  function setupSwatches() {
    document.querySelectorAll('[data-swatches]').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.swatch');
        if (!btn || !row.contains(btn)) return;

        var card = btn.closest('article');
        if (!card) return;

        row.querySelectorAll('.swatch').forEach(function (s) {
          s.setAttribute('aria-pressed', String(s === btn));
        });

        var isMock = btn.hasAttribute('data-mock');
        var photo = card.querySelector('[data-foto]');
        var overlay = card.querySelector('[data-em-breve]');
        var label = card.querySelector('[data-cor-label]');

        if (photo) {
          if (btn.dataset.src) photo.src = btn.dataset.src;
          photo.style.opacity = isMock ? '.28' : '1';
        }
        if (overlay) overlay.classList.toggle('is-visible', isMock);
        if (label && btn.dataset.label) label.textContent = btn.dataset.label;
      });
    });
  }

  /* — Carrossel de depoimentos — */
  function setupCarousel() {
    var track = document.querySelector('[data-depo-track]');
    if (!track) return;

    function scrollBy(dir) {
      var card = track.querySelector('.depo__item');
      var step = card ? card.getBoundingClientRect().width + 18 : track.clientWidth * 0.8;
      track.scrollBy({
        left: dir * step,
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
    }

    var prev = document.querySelector('[data-depo-prev]');
    var next = document.querySelector('[data-depo-next]');
    if (prev) prev.addEventListener('click', function () { scrollBy(-1); });
    if (next) next.addEventListener('click', function () { scrollBy(1); });
  }

  setupReveal();
  setupTilt();
  setupSwatches();
  setupCarousel();
})();
