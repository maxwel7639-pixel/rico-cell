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
     Troca a foto principal e o rótulo do card. Só entram cores que têm
     foto de verdade; o resto vira a linha "outras cores sob consulta". */
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

        var photo = card.querySelector('[data-foto]');
        var label = card.querySelector('[data-cor-label]');

        if (photo && btn.dataset.src) photo.src = btn.dataset.src;
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

  /* — Parallax do fundo do hero -------------------------------------------
     A foto anda mais devagar que a página, criando profundidade. Amarrado
     ao requestAnimationFrame para não recalcular a cada evento de scroll. */
  function setupParallax() {
    var camadas = document.querySelectorAll('[data-parallax]');
    if (!camadas.length || reduceMotion) return;

    var pendente = false;
    function aplicar() {
      pendente = false;
      var y = window.pageYOffset;
      camadas.forEach(function (el) {
        var taxa = parseFloat(el.dataset.parallax) || 0.15;
        /* só mexe enquanto a camada ainda pode estar na tela */
        if (y > el.offsetTop + el.offsetHeight + window.innerHeight) return;
        el.style.transform = 'translate3d(0,' + (y * taxa).toFixed(1) + 'px,0)';
      });
    }
    window.addEventListener('scroll', function () {
      if (pendente) return;
      pendente = true;
      window.requestAnimationFrame(aplicar);
    }, { passive: true });
    aplicar();
  }

  /* — Barra de progresso da leitura — */
  function setupProgress() {
    if (reduceMotion) return;
    var barra = document.createElement('div');
    barra.className = 'progress';
    document.body.appendChild(barra);

    var pendente = false;
    function aplicar() {
      pendente = false;
      var alcance = document.documentElement.scrollHeight - window.innerHeight;
      var p = alcance > 0 ? window.pageYOffset / alcance : 0;
      barra.style.transform = 'scaleX(' + Math.min(1, Math.max(0, p)).toFixed(4) + ')';
    }
    window.addEventListener('scroll', function () {
      if (pendente) return;
      pendente = true;
      window.requestAnimationFrame(aplicar);
    }, { passive: true });
    window.addEventListener('resize', aplicar, { passive: true });
    aplicar();
  }

  /* — Cascata: numera os irmãos de cada grade para escalonar a entrada — */
  function setupStagger() {
    document.querySelectorAll('.card-grid, .depo__track').forEach(function (grade) {
      Array.prototype.forEach.call(grade.children, function (filho, i) {
        filho.style.setProperty('--i', i);
      });
    });
  }

  /* — Ano do rodapé — */
  function setupAno() {
    var ano = document.getElementById('ano');
    if (ano) ano.textContent = new Date().getFullYear();
  }

  /* — Vitrine viva: o que o Rafael cadastra no /painel aparece aqui ---------
     Usa a REST do Supabase direto com fetch, em vez de carregar a biblioteca
     supabase-js inteira só para uma leitura. A chave é a PUBLICÁVEL: a RLS
     só expõe os produtos com disponivel = true, que é o que queremos aqui.
     Se der qualquer erro, a seção continua escondida e o site segue igual. */
  var SB_URL = 'https://bpncnintvpmpqfdtykms.supabase.co';
  var SB_KEY = 'sb_publishable_vHbfOm4ncXqiq4mIDRll3Q_HtXkE4es';
  var CAT = { iphone: 'iPhone', android: 'Android', eletro: 'Eletro' };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var CONDICAO = { lacrado: 'Lacrado', seminovo: 'Seminovo', usado: 'Usado' };

  /* Só entra na ficha o que a loja preencheu. Sem preço vira "Sob consulta"
     — o site continua conversando pelo WhatsApp, como sempre foi. */
  function fichaHtml(p) {
    var itens = [];
    if (p.armazenamento) itens.push(p.armazenamento);
    if (p.condicao) itens.push(CONDICAO[p.condicao] || p.condicao);
    if (p.bateria_pct != null) itens.push('Bateria ' + p.bateria_pct + '%');
    if (p.garantia_meses != null) {
      itens.push(p.garantia_meses + (p.garantia_meses === 1 ? ' mês' : ' meses') + ' de garantia');
    }
    if (!itens.length) return '';
    return '<ul class="ficha">' + itens.map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('') + '</ul>';
  }

  function precoHtml(p) {
    return p.preco != null
      ? '<p class="preco">' + esc(BRL.format(p.preco)) + '</p>'
      : '<p class="preco preco--consulta">Sob consulta</p>';
  }

  function setupVitrine() {
    var secao = document.getElementById('vitrine');
    var grade = document.getElementById('vitrine-grid');
    if (!secao || !grade || !window.fetch) return;

    var url = SB_URL + '/rest/v1/produtos' +
      '?select=id,nome_modelo,categoria,cor,imagem_url,preco,armazenamento,condicao,bateria_pct,garantia_meses' +
      '&disponivel=eq.true' +
      '&order=destaque.desc,created_at.desc' +
      '&limit=6';

    fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (itens) {
        if (!Array.isArray(itens) || !itens.length) return;

        grade.innerHTML = itens.map(function (p, i) {
          var nome = esc(p.nome_modelo);
          var cat = esc(CAT[p.categoria] || p.categoria || '');
          var cor = p.cor ? esc(p.cor) : '';
          var msg = encodeURIComponent(
            'Olá! Vi o ' + p.nome_modelo + (p.cor ? ' ' + p.cor : '') +
            ' no site. Ainda está disponível? [origem: vitrine]');
          var foto = p.imagem_url
            ? '<img class="card__photo" src="' + esc(p.imagem_url) + '" alt="' + nome +
              '" loading="lazy" decoding="async">'
            : '<div class="card__sem-foto" aria-hidden="true">' + cat + '</div>';

          return '' +
            '<article class="card card--tilt reveal" data-tilt style="--i:' + i + '">' +
              '<div class="card__media card__media--square">' + foto +
                '<span class="badge badge--vitrine">' + cat + '</span>' +
              '</div>' +
              '<div class="card__body">' +
                '<h3 class="card__title card__title--xs">' + nome + '</h3>' +
                (cor ? '<p class="card__meta">' + cor + '</p>' : '') +
                precoHtml(p) +
                fichaHtml(p) +
                '<a class="btn btn--wa btn--block btn--nowrap" target="_blank" rel="noopener"' +
                  ' data-produto="' + esc(p.id) + '" data-origem="vitrine" href="' +
                  'https://wa.me/5585994226321?text=' + msg + '">Confira disponibilidade</a>' +
              '</div>' +
            '</article>';
        }).join('');

        secao.hidden = false;
        /* os cards nasceram depois do boot: religa tilt e revelação neles */
        setupTilt();
        setupReveal();
      })
      .catch(function () { /* silêncio: a seção fica escondida */ });
  }

  /* — Registro de interesse ------------------------------------------------
     Cada clique num botão de WhatsApp vira uma linha em `cliques`, para o
     Rafael ver no painel qual aparelho as pessoas mais querem. A RLS deixa
     o visitante só INSERIR — ninguém anônimo consegue ler esses números.
     É disparo e esquece: se falhar, o link do WhatsApp abre do mesmo jeito. */
  function setupInteresse() {
    if (!window.fetch) return;

    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href*="wa.me/"]');
      if (!a) return;

      var origem = a.dataset.origem;
      if (!origem) {
        /* os links fixos já carregam [origem: x] no texto da mensagem */
        var m = decodeURIComponent(a.getAttribute('href') || '').match(/\[origem:\s*([^\]]+)\]/);
        origem = m ? m[1].trim() : 'geral';
      }

      var corpo = { origem: origem.slice(0, 60) };
      if (a.dataset.produto) corpo.produto_id = a.dataset.produto;

      /* fetch com keepalive: sobrevive à navegação para o WhatsApp e ainda
         manda os cabeçalhos. sendBeacon NÃO serve aqui — ele não envia
         cabeçalho, e mandar JSON pela query dispara preflight de CORS que o
         beacon não consegue completar (falha calada com ERR_FAILED). */
      try {
        fetch(SB_URL + '/rest/v1/cliques', {
          method: 'POST',
          keepalive: true,
          body: JSON.stringify(corpo),
          headers: {
            'Content-Type': 'application/json',
            apikey: SB_KEY,
            Authorization: 'Bearer ' + SB_KEY,
            Prefer: 'return=minimal'
          }
        }).catch(function () {});
      } catch (e) { /* nunca atrapalha o clique */ }
    }, true);
  }

  setupStagger();
  setupReveal();
  setupTilt();
  setupSwatches();
  setupCarousel();
  setupParallax();
  setupProgress();
  setupAno();
  setupVitrine();
  setupInteresse();
})();
