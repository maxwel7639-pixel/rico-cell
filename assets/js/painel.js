/* Rico Cell — /painel
   Conectado ao Supabase de verdade: Auth (e-mail+senha, sem cadastro público)
   e CRUD da tabela `produtos`, com upload de foto no bucket `produtos`.
   Sem build: supabase-js é carregado via CDN em painel/index.html. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://bpncnintvpmpqfdtykms.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vHbfOm4ncXqiq4mIDRll3Q_HtXkE4es';
  var BUCKET = 'produtos';
  var PLACEHOLDER_FOTO = '../assets/img/logo-rico-cell.jpg';
  var CORES_PADRAO = ['Grafite', 'Verde-água', 'Verde', 'Preto', 'Branco'];
  var CATEGORIAS = [
    { valor: 'iphone', rotulo: 'iPhone' },
    { valor: 'android', rotulo: 'Android' },
    { valor: 'eletro', rotulo: 'Eletro' }
  ];

  var sb;

  /* Paleta dourada única pros 3 gráficos — nada de cinza/azul neutro,
     tudo dentro da família de cor da marca (mais clara → mais escura). */
  var COR_OURO_CLARA = '#ffd400';
  var COR_OURO_MEDIA = '#d8b34a';
  var COR_OURO_ESCURA = '#a3823f';

  var CARDS_DASH = [
    { chave: 'gastoTotal', rotulo: 'Gasto total', formato: 'moeda' },
    { chave: 'cliques', rotulo: 'Cliques', formato: 'numero' },
    { chave: 'impressoes', rotulo: 'Impressões', formato: 'numero' },
    { chave: 'ctr', rotulo: 'CTR', formato: 'percentual' },
    { chave: 'cpc', rotulo: 'CPC', formato: 'moeda' },
    { chave: 'resultados', rotulo: 'Resultados', sub: 'Conversas iniciadas', formato: 'numero' }
  ];

  var state = {
    aba: 'dashboard',
    produtos: [],
    filtro: 'todos',
    busca: '',
    visualizacao: 'grade',
    selecionados: new Set(),
    editandoId: null,
    excluindoIds: null,
    fotoArquivo: null,
    fotoPreviewUrl: '',
    salvando: false,
    dashPeriodo: '7d',
    dashPedidoId: 0,
    dashDados: null,
    charts: { gasto: null, cliques: null, categorias: null },
    isDesktop: false
  };

  var el = {};

  function cacheEls() {
    [
      'pnl-boot', 'pnl-boot-error', 'pnl-login', 'pnl-painel',
      'pnl-login-form', 'pnl-login-error', 'pnl-email', 'pnl-senha', 'pnl-login-submit',
      'pnl-logout',
      'pnl-sidebar', 'pnl-sidebar-toggle', 'pnl-side-btn-dashboard', 'pnl-side-btn-produtos', 'pnl-sidebar-logout',
      'pnl-tab-dashboard', 'pnl-tab-produtos', 'pnl-tab-btn-dashboard', 'pnl-tab-btn-produtos',
      'pnl-period', 'pnl-dash-demo', 'pnl-dash-error', 'pnl-dash-cards', 'pnl-dash-charts',
      'pnl-chart-gasto', 'pnl-chart-cliques', 'pnl-chart-categorias', 'pnl-interesse',
      'pnl-summary', 'pnl-warning', 'pnl-produtos-toolbar', 'pnl-filters', 'pnl-busca',
      'pnl-bulk-bar', 'pnl-bulk-count', 'pnl-bulk-excluir', 'pnl-bulk-limpar',
      'pnl-produtos-lista', 'pnl-grid', 'pnl-tabela', 'pnl-tabela-body', 'pnl-tabela-check-all',
      'pnl-empty', 'pnl-load-error',
      'pnl-novo', 'pnl-modal-backdrop', 'pnl-modal-title', 'pnl-modal-close',
      'pnl-form', 'pnl-form-error', 'pnl-photo-field', 'pnl-foto', 'pnl-photo-preview', 'pnl-photo-caption',
      'pnl-nome', 'pnl-categoria', 'pnl-cor-select', 'pnl-cor-outra-field', 'pnl-cor-outra',
      'pnl-preco', 'pnl-armazenamento', 'pnl-condicao', 'pnl-garantia',
      'pnl-bateria', 'pnl-bateria-field',
      'pnl-form-disponivel', 'pnl-form-destaque', 'pnl-form-submit',
      'pnl-confirm-backdrop', 'pnl-confirm-title', 'pnl-confirm-text', 'pnl-confirm-cancel', 'pnl-confirm-delete',
      'pnl-toast'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var CONDICAO = { lacrado: 'Lacrado', seminovo: 'Seminovo', usado: 'Usado' };

  function precoHtml(p) {
    return p.preco != null
      ? '<span class="pnl-preco">' + escapeHtml(BRL.format(p.preco)) + '</span>'
      : '<span class="pnl-preco pnl-preco--vazio">Sob consulta</span>';
  }

  /* Etiquetas da ficha técnica — só entra o que foi preenchido. */
  function specHtml(p) {
    var itens = [];
    if (p.armazenamento) itens.push(p.armazenamento);
    if (p.condicao) itens.push(CONDICAO[p.condicao] || p.condicao);
    if (p.bateria_pct != null) itens.push('Bateria ' + p.bateria_pct + '%');
    if (p.garantia_meses != null) itens.push(p.garantia_meses + ' ' + (p.garantia_meses === 1 ? 'mês' : 'meses') + ' de garantia');
    if (!itens.length) return '';
    return '<div class="pnl-spec">' + itens.map(function (t) {
      return '<span>' + escapeHtml(t) + '</span>';
    }).join('') + '</div>';
  }

  function categoriaRotulo(valor) {
    var c = CATEGORIAS.filter(function (x) { return x.valor === valor; })[0];
    return c ? c.rotulo : valor;
  }

  function showToast(mensagem, tipo) {
    el['pnl-toast'].textContent = mensagem;
    el['pnl-toast'].classList.toggle('pnl-toast--sucesso', tipo === 'sucesso');
    el['pnl-toast'].hidden = false;
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () { el['pnl-toast'].hidden = true; }, 4000);
  }

  function mensagemAuth(error) {
    if (!error) return '';
    if (/invalid login credentials/i.test(error.message)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(error.message)) return 'Confirme o convite enviado por e-mail antes de entrar.';
    return 'Não foi possível entrar. Tente novamente.';
  }

  /* — Sessão / troca de tela ------------------------------------------------ */

  function mostrarLogin() {
    el['pnl-boot'].hidden = true;
    el['pnl-painel'].hidden = true;
    el['pnl-login'].hidden = false;
  }

  function mostrarPainel() {
    el['pnl-boot'].hidden = true;
    el['pnl-login'].hidden = true;
    el['pnl-painel'].hidden = false;
    trocarAba(state.aba);
  }

  /* — Abas (Dashboard / Produtos) -------------------------------------------- */

  function trocarAba(aba) {
    state.aba = aba;
    el['pnl-tab-dashboard'].hidden = aba !== 'dashboard';
    el['pnl-tab-produtos'].hidden = aba !== 'produtos';

    [
      [el['pnl-tab-btn-dashboard'], aba === 'dashboard'],
      [el['pnl-tab-btn-produtos'], aba === 'produtos'],
      [el['pnl-side-btn-dashboard'], aba === 'dashboard'],
      [el['pnl-side-btn-produtos'], aba === 'produtos']
    ].forEach(function (par) {
      par[0].classList.toggle('is-active', par[1]);
      par[0].setAttribute('aria-selected', String(par[1]));
    });

    if (aba === 'dashboard') {
      carregarDashboard();
    } else {
      state.selecionados.clear();
      atualizarBarraSelecao();
      carregarProdutos();
    }
  }

  /* — Sidebar colapsável (só existe no layout desktop) ------------------------ */

  var SIDEBAR_STORAGE_KEY = 'rc-painel-sidebar-expandida';

  function aplicarEstadoSidebar(expandida) {
    el['pnl-painel'].classList.toggle('pnl-sidebar-expandida', expandida);
    el['pnl-sidebar-toggle'].setAttribute('aria-expanded', String(expandida));
    el['pnl-sidebar-toggle'].setAttribute('aria-label', expandida ? 'Recolher menu' : 'Expandir menu');
  }

  function sidebarEstaExpandida() {
    return el['pnl-painel'].classList.contains('pnl-sidebar-expandida');
  }

  function alternarSidebar() {
    var expandida = !sidebarEstaExpandida();
    aplicarEstadoSidebar(expandida);
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, expandida ? '1' : '0'); } catch (error) { /* localStorage indisponível — só não persiste */ }
  }

  /* — Dashboard (métricas de anúncios) ---------------------------------------- */

  function formatarValor(valor, formato) {
    var n = Number(valor || 0);
    if (formato === 'moeda') return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (formato === 'percentual') return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    return n.toLocaleString('pt-BR');
  }

  function renderDashboard(dados) {
    el['pnl-dash-demo'].hidden = !dados.demo;
    el['pnl-dash-cards'].innerHTML = CARDS_DASH.map(function (c) {
      return '<div class="pnl-stat-card">' +
        '<span class="pnl-stat-card__label">' + escapeHtml(c.rotulo) + '</span>' +
        '<span class="pnl-stat-card__value">' + formatarValor(dados[c.chave], c.formato) + '</span>' +
        (c.sub ? '<span class="pnl-stat-card__sub">' + escapeHtml(c.sub) + '</span>' : '') +
        '</div>';
    }).join('');
  }

  /* — Gráficos (Chart.js, só existem no layout desktop) ----------------------- */

  function destruirGraficos() {
    Object.keys(state.charts).forEach(function (chave) {
      if (state.charts[chave]) { state.charts[chave].destroy(); state.charts[chave] = null; }
    });
  }

  function renderCharts(dados) {
    if (state.aba !== 'dashboard' || !dados) return;
    destruirGraficos();

    var rotulos = dados.serieDiaria.map(function (d) { return d.data.slice(5); });

    state.charts.gasto = new Chart(el['pnl-chart-gasto'].getContext('2d'), {
      type: 'line',
      data: {
        labels: rotulos,
        datasets: [{
          label: 'Gasto (R$)',
          data: dados.serieDiaria.map(function (d) { return d.gasto; }),
          borderColor: COR_OURO_CLARA,
          backgroundColor: 'rgba(255,212,0,.14)',
          fill: true,
          tension: .42,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#8a8f9c' }, grid: { color: 'rgba(255,255,255,.04)' } },
          x: { ticks: { color: '#8a8f9c' }, grid: { display: false } }
        }
      }
    });

    state.charts.cliques = new Chart(el['pnl-chart-cliques'].getContext('2d'), {
      type: 'bar',
      data: {
        labels: rotulos,
        datasets: [
          { label: 'Cliques', data: dados.serieDiaria.map(function (d) { return d.cliques; }), backgroundColor: COR_OURO_CLARA },
          { label: 'Impressões', data: dados.serieDiaria.map(function (d) { return d.impressoes; }), backgroundColor: COR_OURO_ESCURA }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#c8ccd6' } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#8a8f9c' }, grid: { color: 'rgba(255,255,255,.04)' } },
          x: { ticks: { color: '#8a8f9c' }, grid: { display: false } }
        }
      }
    });

    var categorias = dados.categorias || [];
    state.charts.categorias = new Chart(el['pnl-chart-categorias'].getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: categorias.map(function (c) { return categoriaRotulo(c.categoria); }),
        datasets: [{
          data: categorias.map(function (c) { return c.resultados; }),
          backgroundColor: [COR_OURO_CLARA, COR_OURO_MEDIA, COR_OURO_ESCURA]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#c8ccd6' } } }
      }
    });
  }

  /* — Mais procurados: agrega a tabela `cliques` do periodo escolhido.
     Vem do proprio Supabase (nao do Meta), entao independe da conta de
     anuncios estar configurada. */
  async function carregarInteresse() {
    var alvo = el['pnl-interesse'];
    if (!alvo) return;

    var dias = state.dashPeriodo === '30d' ? 30 : 7;
    var desde = new Date(Date.now() - dias * 864e5).toISOString();

    var res = await sb
      .from('cliques')
      .select('origem, produto_id, produtos(nome_modelo)')
      .gte('created_at', desde)
      .limit(2000);

    if (res.error) {
      alvo.innerHTML = '<li class="pnl-interesse__vazio">Não foi possível carregar os cliques.</li>';
      return;
    }

    var linhas = res.data || [];
    if (!linhas.length) {
      alvo.innerHTML = '<li class="pnl-interesse__vazio">Nenhum clique registrado ainda neste período.</li>';
      return;
    }

    var contagem = {};
    linhas.forEach(function (c) {
      var nome = (c.produtos && c.produtos.nome_modelo) || c.origem || 'geral';
      contagem[nome] = (contagem[nome] || 0) + 1;
    });

    var ordenado = Object.keys(contagem)
      .map(function (k) { return { nome: k, n: contagem[k] }; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 8);

    var maior = ordenado[0].n;
    alvo.innerHTML = ordenado.map(function (item) {
      var pct = Math.round((item.n / maior) * 100);
      return '<li class="pnl-interesse__item">' +
          '<span class="pnl-interesse__nome">' + escapeHtml(item.nome) + '</span>' +
          '<span class="pnl-interesse__barra"><i style="width:' + pct + '%"></i></span>' +
          '<span class="pnl-interesse__n">' + item.n + '</span>' +
        '</li>';
    }).join('');
  }

  async function carregarDashboard() {
    /* Guarda por número de pedido: cliques rápidos no seletor de período
       podem fazer duas chamadas resolverem fora de ordem — só a mais
       recente pode atualizar a tela. */
    var meuPedido = ++state.dashPedidoId;
    el['pnl-dash-error'].hidden = true;
    el['pnl-dash-cards'].setAttribute('aria-busy', 'true');
    try {
      var sessRes = await sb.auth.getSession();
      var token = sessRes.data.session && sessRes.data.session.access_token;
      if (!token) throw new Error('sem sessão ativa');

      var resp = await fetch('/api/ads-metrics?period=' + state.dashPeriodo, {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!resp.ok) throw new Error('falha ao consultar /api/ads-metrics');

      var dados = await resp.json();
      if (meuPedido !== state.dashPedidoId) return;
      renderDashboard(dados);
      state.dashDados = dados;
      renderCharts(dados);
      carregarInteresse();
    } catch (error) {
      if (meuPedido !== state.dashPedidoId) return;
      el['pnl-dash-error'].hidden = false;
      el['pnl-dash-error'].textContent = 'Não foi possível carregar as métricas de anúncios.';
      /* o bloco de interesse não depende do Meta — carrega de qualquer jeito */
      carregarInteresse();
    } finally {
      if (meuPedido === state.dashPedidoId) el['pnl-dash-cards'].removeAttribute('aria-busy');
    }
  }

  /* — Carregar / renderizar produtos ---------------------------------------- */

  async function carregarProdutos() {
    el['pnl-load-error'].hidden = true;
    el['pnl-grid'].setAttribute('aria-busy', 'true');
    var res = await sb.from('produtos').select('*').order('created_at', { ascending: false });
    el['pnl-grid'].removeAttribute('aria-busy');
    if (res.error) {
      el['pnl-load-error'].hidden = false;
      el['pnl-load-error'].textContent = 'Não foi possível carregar os produtos.';
      return;
    }
    state.produtos = res.data || [];
    render();
  }

  function render() {
    renderFiltros();
    renderResumo();
    renderGrid();
    renderTabela();
  }

  function renderResumo() {
    var total = state.produtos.length;
    var disponiveis = state.produtos.filter(function (p) { return p.disponivel; }).length;
    var destaques = state.produtos.filter(function (p) { return p.destaque; }).length;
    el['pnl-summary'].textContent = total + ' cadastrados · ' + disponiveis + ' disponíveis · ' + destaques + ' em destaque';
    if (destaques > 4) {
      el['pnl-warning'].hidden = false;
      el['pnl-warning'].textContent = 'Você tem ' + destaques + ' produtos em destaque — recomendamos até 4 pra manter a seção limpa.';
    } else {
      el['pnl-warning'].hidden = true;
    }
  }

  function renderFiltros() {
    var grupos = [{ valor: 'todos', rotulo: 'Todos' }].concat(CATEGORIAS);
    el['pnl-filters'].innerHTML = grupos.map(function (g) {
      var n = g.valor === 'todos' ? state.produtos.length : state.produtos.filter(function (p) { return p.categoria === g.valor; }).length;
      var ativo = state.filtro === g.valor;
      return '<button type="button" class="pnl-filter' + (ativo ? ' is-active' : '') + '" data-filtro="' + g.valor + '">' +
        escapeHtml(g.rotulo) + ' (' + n + ')</button>';
    }).join('');
  }

  function produtosVisiveis() {
    var lista = state.filtro === 'todos' ? state.produtos : state.produtos.filter(function (p) { return p.categoria === state.filtro; });
    var termo = state.busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(function (p) { return p.nome_modelo.toLowerCase().indexOf(termo) !== -1; });
  }

  /* Ícones e sub-componentes compartilhados entre o card (grade) e a
     linha da tabela — mesmo visual nos dois modos de visualização. */
  var ICONE_EDITAR = '<svg viewBox="0 0 256 256" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="m227.31 73.37-44.68-44.69a16 16 0 0 0-22.63 0L36.69 152A15.86 15.86 0 0 0 32 163.31V208a16 16 0 0 0 16 16h44.69a15.86 15.86 0 0 0 11.31-4.69L227.31 96a16 16 0 0 0 0-22.63ZM92.69 208H48v-44.69l88-88L180.69 120ZM192 108.68 147.31 64l24-24L216 84.68Z"></path></svg>';
  var ICONE_DUPLICAR = '<svg viewBox="0 0 256 256" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8Zm-56 176H48V96h112Zm48-48h-32V88a8 8 0 0 0-8-8H96V48h112Z"></path></svg>';
  var ICONE_EXCLUIR = '<svg viewBox="0 0 256 256" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16ZM96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Zm48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Z"></path></svg>';

  function trilhoHtml(on) {
    return '<span class="pnl-toggle' + (on ? ' is-on' : '') + '"><span class="pnl-toggle__thumb"></span></span>';
  }

  function estrelaHtml(on) {
    return '<svg class="' + (on ? 'is-on' : '') + '" viewBox="0 0 256 256" width="18" height="18" aria-hidden="true"><path d="M239.2 97.29a16 16 0 0 0-13.81-11L166 81.17 142.72 25.81a15.95 15.95 0 0 0-29.44 0L90 81.17 30.61 86.32a16 16 0 0 0-9.11 28.06l45 39.29-13.42 58.6a16 16 0 0 0 23.84 17.34L128 199.35l51.08 30.26a16 16 0 0 0 23.84-17.34l-13.42-58.6 45-39.29a16 16 0 0 0 4.7-17.09Z"></path></svg>';
  }

  function botoesAcaoHtml(p) {
    return (
      '<button type="button" class="pnl-icon-btn" data-action="editar" aria-label="Editar" title="Editar">' + ICONE_EDITAR + '</button>' +
      '<button type="button" class="pnl-icon-btn" data-action="duplicar" aria-label="Duplicar" title="Duplicar">' + ICONE_DUPLICAR + '</button>' +
      '<button type="button" class="pnl-icon-btn pnl-icon-btn--danger" data-action="excluir" aria-label="Excluir" title="Excluir">' + ICONE_EXCLUIR + '</button>'
    );
  }

  function cardTemplate(p) {
    var foto = p.imagem_url || PLACEHOLDER_FOTO;
    var marcado = state.selecionados.has(p.id);
    return (
      '<article class="pnl-card" data-id="' + p.id + '">' +
        '<input type="checkbox" class="pnl-select-check" data-id="' + p.id + '"' + (marcado ? ' checked' : '') + ' aria-label="Selecionar ' + escapeHtml(p.nome_modelo) + '">' +
        '<div class="pnl-card__photo-wrap">' +
          '<span class="pnl-card__photo lighten" style="background-image:url(\'' + escapeHtml(foto) + '\')"></span>' +
          (p.destaque ? '<span class="pnl-card__badge">Destaque</span>' : '') +
        '</div>' +
        '<div class="pnl-card__body">' +
          '<div class="pnl-card__top">' +
            '<div class="pnl-card__info">' +
              '<h3 class="pnl-card__name">' + escapeHtml(p.nome_modelo) + '</h3>' +
              '<div class="pnl-card__tags">' +
                '<span class="pnl-tag">' + escapeHtml(categoriaRotulo(p.categoria)) + '</span>' +
                '<span class="pnl-card__color">' + escapeHtml(p.cor) + '</span>' +
                precoHtml(p) +
              '</div>' +
              specHtml(p) +
            '</div>' +
            '<div class="pnl-card__actions">' + botoesAcaoHtml(p) + '</div>' +
          '</div>' +
          '<div class="pnl-card__toggles">' +
            '<button type="button" class="pnl-toggle-btn" data-action="toggle-disponivel">' +
              trilhoHtml(p.disponivel) +
              '<span class="pnl-toggle-label' + (p.disponivel ? ' is-on' : '') + '">Disponível</span>' +
            '</button>' +
            '<button type="button" class="pnl-star-btn" data-action="toggle-destaque" aria-label="Destaque">' +
              estrelaHtml(p.destaque) +
              '<span class="pnl-toggle-label pnl-toggle-label--gold' + (p.destaque ? ' is-on' : '') + '">Destaque</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function linhaTabela(p) {
    var foto = p.imagem_url || PLACEHOLDER_FOTO;
    var marcado = state.selecionados.has(p.id);
    return (
      '<tr data-id="' + p.id + '">' +
        '<td><input type="checkbox" class="pnl-select-check" data-id="' + p.id + '"' + (marcado ? ' checked' : '') + ' aria-label="Selecionar ' + escapeHtml(p.nome_modelo) + '"></td>' +
        '<td><img class="pnl-tabela__thumb" src="' + escapeHtml(foto) + '" alt=""></td>' +
        '<td class="pnl-tabela__nome">' + escapeHtml(p.nome_modelo) + (p.destaque ? ' ★' : '') + '</td>' +
        '<td>' + escapeHtml(categoriaRotulo(p.categoria)) + '</td>' +
        '<td>' + escapeHtml(p.cor) + '</td>' +
        '<td><button type="button" class="pnl-toggle-btn" data-action="toggle-disponivel">' + trilhoHtml(p.disponivel) + '</button></td>' +
        '<td><button type="button" class="pnl-star-btn" data-action="toggle-destaque" aria-label="Destaque">' + estrelaHtml(p.destaque) + '</button></td>' +
        '<td class="pnl-tabela__acoes">' + botoesAcaoHtml(p) + '</td>' +
      '</tr>'
    );
  }

  function renderGrid() {
    var visiveis = produtosVisiveis();
    el['pnl-grid'].innerHTML = visiveis.map(cardTemplate).join('');
    el['pnl-empty'].hidden = visiveis.length !== 0;
  }

  function renderTabela() {
    el['pnl-tabela-body'].innerHTML = produtosVisiveis().map(linhaTabela).join('');
  }

  /* — Visualização Grade/Tabela (só existe no layout desktop) ----------------- */

  function aplicarVisualizacao() {
    var tabela = state.isDesktop && state.visualizacao === 'tabela';
    el['pnl-grid'].hidden = tabela;
    el['pnl-tabela'].hidden = !tabela;
  }

  function forcarVisualizacaoGrade() {
    el['pnl-grid'].hidden = false;
    el['pnl-tabela'].hidden = true;
  }

  function encontrarProduto(id) {
    return state.produtos.filter(function (p) { return String(p.id) === String(id); })[0];
  }

  function setupGridDelegation() {
    el['pnl-produtos-lista'].addEventListener('click', function (ev) {
      var check = ev.target.closest('.pnl-select-check');
      if (check) {
        if (check.checked) state.selecionados.add(check.dataset.id);
        else state.selecionados.delete(check.dataset.id);
        atualizarBarraSelecao();
        return;
      }
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var card = ev.target.closest('[data-id]');
      var produto = card && encontrarProduto(card.dataset.id);
      if (!produto) return;
      var action = btn.dataset.action;
      if (action === 'editar') abrirModal(produto, false);
      else if (action === 'duplicar') abrirModal(produto, true);
      else if (action === 'excluir') abrirConfirm(produto);
      else if (action === 'toggle-disponivel') alternarCampo(produto, 'disponivel');
      else if (action === 'toggle-destaque') alternarCampo(produto, 'destaque');
    });

    el['pnl-tabela-check-all'].addEventListener('change', function (ev) {
      var lista = produtosVisiveis();
      lista.forEach(function (p) {
        if (ev.target.checked) state.selecionados.add(p.id);
        else state.selecionados.delete(p.id);
      });
      render();
      atualizarBarraSelecao();
    });
  }

  /* Chave produtoId:campo em voo — um segundo clique no mesmo toggle
     enquanto o primeiro update ainda não voltou vira um no-op, evitando
     duas requisições que podem resolver fora de ordem. */
  var togglesEmAndamento = {};

  async function alternarCampo(produto, campo) {
    var chave = produto.id + ':' + campo;
    if (togglesEmAndamento[chave]) return;
    togglesEmAndamento[chave] = true;

    var anterior = produto[campo];
    produto[campo] = !anterior;
    render();
    try {
      var res = await sb.from('produtos').update({ [campo]: produto[campo] }).eq('id', produto.id);
      if (res.error) {
        produto[campo] = anterior;
        render();
        showToast('Não foi possível atualizar. Tente novamente.');
      }
    } finally {
      delete togglesEmAndamento[chave];
    }
  }

  /* — Seleção em lote (só existe no layout desktop) ---------------------------- */

  var ACOES_LOTE = {
    'disponivel-on': ['disponivel', true],
    'disponivel-off': ['disponivel', false],
    'destaque-on': ['destaque', true],
    'destaque-off': ['destaque', false]
  };

  function atualizarBarraSelecao() {
    var n = state.selecionados.size;
    el['pnl-bulk-bar'].hidden = n === 0;
    el['pnl-bulk-count'].textContent = n === 1 ? '1 selecionado' : n + ' selecionados';
  }

  async function aplicarAcaoLote(chaveAcao) {
    var par = ACOES_LOTE[chaveAcao];
    if (!par) return;
    var ids = Array.from(state.selecionados);
    if (!ids.length) return;

    var payload = {};
    payload[par[0]] = par[1];
    var res = await sb.from('produtos').update(payload).in('id', ids);
    if (res.error) {
      showToast('Não foi possível atualizar em lote. Tente novamente.');
      return;
    }
    state.selecionados.clear();
    atualizarBarraSelecao();
    carregarProdutos();
    showToast('Produtos atualizados.', 'sucesso');
  }

  /* — Modal adicionar/editar/duplicar --------------------------------------- */

  /* Saúde da bateria só faz sentido em aparelho que já foi usado. */
  function atualizarCampoBateria() {
    var c = el['pnl-condicao'].value;
    var mostra = c === 'seminovo' || c === 'usado';
    el['pnl-bateria-field'].hidden = !mostra;
    if (!mostra) el['pnl-bateria'].value = '';
  }

  function trilho(botao, on) {
    botao.querySelector('.pnl-toggle').classList.toggle('is-on', on);
    botao.dataset.on = on ? '1' : '0';
  }

  function abrirModal(produtoBase, duplicando) {
    state.editandoId = duplicando ? null : (produtoBase ? produtoBase.id : null);
    state.fotoArquivo = null;
    state.fotoPreviewUrl = produtoBase ? (duplicando ? '' : (produtoBase.imagem_url || '')) : '';

    var corAtual = produtoBase ? produtoBase.cor : '';
    var corConhecida = CORES_PADRAO.indexOf(corAtual) !== -1;

    el['pnl-modal-title'].textContent = state.editandoId ? 'Editar produto' : 'Novo produto';
    el['pnl-nome'].value = produtoBase ? produtoBase.nome_modelo : '';
    el['pnl-categoria'].value = produtoBase ? produtoBase.categoria : 'iphone';
    el['pnl-cor-select'].value = produtoBase ? (corConhecida ? corAtual : (corAtual ? 'Outra' : '')) : '';
    el['pnl-cor-outra'].value = produtoBase && !corConhecida ? corAtual : '';
    el['pnl-cor-outra-field'].hidden = el['pnl-cor-select'].value !== 'Outra';

    el['pnl-preco'].value         = produtoBase && produtoBase.preco != null ? produtoBase.preco : '';
    el['pnl-armazenamento'].value = produtoBase ? (produtoBase.armazenamento || '') : '';
    el['pnl-condicao'].value      = produtoBase ? (produtoBase.condicao || '') : '';
    el['pnl-garantia'].value      = produtoBase && produtoBase.garantia_meses != null ? produtoBase.garantia_meses : '';
    el['pnl-bateria'].value       = produtoBase && produtoBase.bateria_pct != null ? produtoBase.bateria_pct : '';
    atualizarCampoBateria();

    trilho(el['pnl-form-disponivel'], produtoBase ? produtoBase.disponivel : true);
    trilho(el['pnl-form-destaque'], produtoBase ? produtoBase.destaque : false);

    atualizarPreviewFoto();
    el['pnl-form-error'].hidden = true;

    el['pnl-modal-backdrop'].hidden = false;
    el['pnl-nome'].focus();
  }

  function fecharModal() {
    revogarPreviewSeNecessario();
    el['pnl-modal-backdrop'].hidden = true;
    state.editandoId = null;
    state.fotoArquivo = null;
    state.fotoPreviewUrl = '';
    el['pnl-foto'].value = '';
  }

  function revogarPreviewSeNecessario() {
    if (state.fotoPreviewUrl && state.fotoPreviewUrl.indexOf('blob:') === 0) {
      URL.revokeObjectURL(state.fotoPreviewUrl);
    }
  }

  function atualizarPreviewFoto() {
    if (state.fotoPreviewUrl) {
      el['pnl-photo-preview'].style.backgroundImage = "url('" + state.fotoPreviewUrl + "')";
      el['pnl-photo-caption'].textContent = 'Toque para trocar a imagem, ou arraste uma foto aqui';
    } else {
      el['pnl-photo-preview'].style.backgroundImage = 'none';
      el['pnl-photo-caption'].textContent = 'Toque para escolher, ou arraste uma foto aqui';
    }
  }

  /* Usada tanto pelo input de arquivo tradicional quanto pelo drop de
     arrastar-e-soltar — mesma lógica, duas formas de disparar. */
  function usarArquivoFoto(file) {
    if (!file) return;
    revogarPreviewSeNecessario();
    state.fotoArquivo = file;
    state.fotoPreviewUrl = URL.createObjectURL(file);
    atualizarPreviewFoto();
  }

  function slugify(nome) {
    return nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'produto';
  }

  async function uploadFoto(file) {
    var caminho = Date.now() + '-' + slugify(file.name.replace(/\.[^.]+$/, '')) + (file.name.match(/\.[^.]+$/) || [''])[0];
    var res = await sb.storage.from(BUCKET).upload(caminho, file, { upsert: false });
    if (res.error) throw res.error;
    return sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  }

  function setSalvando(salvando) {
    state.salvando = salvando;
    el['pnl-form-submit'].disabled = salvando;
    el['pnl-form-submit'].textContent = salvando ? 'Salvando…' : 'Salvar produto';
  }

  async function submitForm(ev) {
    ev.preventDefault();
    if (state.salvando) return;

    var nome = el['pnl-nome'].value.trim();
    if (!nome) { el['pnl-nome'].focus(); return; }

    var corSel = el['pnl-cor-select'].value;
    var corFinal = corSel === 'Outra' ? el['pnl-cor-outra'].value.trim() : corSel;
    if (!corFinal) { el['pnl-cor-select'].focus(); return; }

    /* campo em branco vira null: o site trata ausência, não string vazia */
    function numOuNulo(v) {
      var t = String(v == null ? '' : v).trim().replace(',', '.');
      if (!t) return null;
      var n = Number(t);
      return isFinite(n) ? n : null;
    }
    function txtOuNulo(v) {
      var t = String(v == null ? '' : v).trim();
      return t || null;
    }

    var payload = {
      nome_modelo: nome,
      categoria: el['pnl-categoria'].value,
      cor: corFinal,
      preco: numOuNulo(el['pnl-preco'].value),
      armazenamento: txtOuNulo(el['pnl-armazenamento'].value),
      condicao: txtOuNulo(el['pnl-condicao'].value),
      garantia_meses: numOuNulo(el['pnl-garantia'].value),
      bateria_pct: numOuNulo(el['pnl-bateria'].value),
      disponivel: el['pnl-form-disponivel'].dataset.on === '1',
      destaque: el['pnl-form-destaque'].dataset.on === '1'
    };

    el['pnl-form-error'].hidden = true;
    setSalvando(true);

    try {
      var novaUrl = state.fotoArquivo ? await uploadFoto(state.fotoArquivo) : null;
      if (novaUrl) payload.imagem_url = novaUrl;
      else if (!state.editandoId && state.fotoPreviewUrl) payload.imagem_url = state.fotoPreviewUrl;

      var res = state.editandoId
        ? await sb.from('produtos').update(payload).eq('id', state.editandoId).select()
        : await sb.from('produtos').insert(payload).select();

      if (res.error) throw res.error;

      setSalvando(false);
      var eraEdicao = !!state.editandoId;
      fecharModal();
      carregarProdutos();
      showToast(eraEdicao ? 'Produto atualizado.' : 'Produto adicionado.', 'sucesso');
    } catch (error) {
      setSalvando(false);
      el['pnl-form-error'].hidden = false;
      el['pnl-form-error'].textContent = 'Não foi possível salvar. ' + (error && error.message ? error.message : 'Tente novamente.');
    }
  }

  /* — Confirmação de exclusão (aceita um produto único ou uma lista, pra
     servir tanto o botão de excluir do card/linha quanto o "Excluir
     selecionados" da barra de ações em lote) ------------------------------- */

  function abrirConfirm(alvo) {
    var lista = Array.isArray(alvo) ? alvo : [alvo];
    state.excluindoIds = lista.map(function (p) { return p.id; });
    el['pnl-confirm-title'].textContent = lista.length > 1 ? 'Excluir ' + lista.length + ' produtos?' : 'Excluir produto?';
    el['pnl-confirm-text'].textContent = lista.length > 1
      ? lista.length + ' produtos selecionados saem da lista e deixam de aparecer no site.'
      : '"' + lista[0].nome_modelo + '" sai da lista e deixa de aparecer no site.';
    el['pnl-confirm-backdrop'].hidden = false;
  }

  function fecharConfirm() {
    state.excluindoIds = null;
    el['pnl-confirm-backdrop'].hidden = true;
  }

  async function confirmarExclusao() {
    var ids = state.excluindoIds;
    if (!ids || !ids.length) return;
    el['pnl-confirm-delete'].disabled = true;
    var res = await sb.from('produtos').delete().in('id', ids);
    el['pnl-confirm-delete'].disabled = false;
    if (res.error) {
      showToast('Não foi possível excluir. Tente novamente.');
      return;
    }
    ids.forEach(function (id) { state.selecionados.delete(id); });
    fecharConfirm();
    atualizarBarraSelecao();
    carregarProdutos();
    showToast(ids.length > 1 ? 'Produtos excluídos.' : 'Produto excluído.', 'sucesso');
  }

  /* — Eventos ----------------------------------------------------------------- */

  function setupEventos() {
    el['pnl-login-form'].addEventListener('submit', async function (ev) {
      ev.preventDefault();
      el['pnl-login-error'].hidden = true;
      el['pnl-login-submit'].disabled = true;
      el['pnl-login-submit'].textContent = 'Entrando…';
      var res = await sb.auth.signInWithPassword({
        email: el['pnl-email'].value.trim(),
        password: el['pnl-senha'].value
      });
      el['pnl-login-submit'].disabled = false;
      el['pnl-login-submit'].textContent = 'Entrar';
      if (res.error) {
        el['pnl-login-error'].hidden = false;
        el['pnl-login-error'].textContent = mensagemAuth(res.error);
      }
    });

    el['pnl-logout'].addEventListener('click', function () { sb.auth.signOut(); });

    el['pnl-tab-btn-dashboard'].addEventListener('click', function () { trocarAba('dashboard'); });
    el['pnl-tab-btn-produtos'].addEventListener('click', function () { trocarAba('produtos'); });
    el['pnl-side-btn-dashboard'].addEventListener('click', function () { trocarAba('dashboard'); });
    el['pnl-side-btn-produtos'].addEventListener('click', function () { trocarAba('produtos'); });
    el['pnl-sidebar-logout'].addEventListener('click', function () { sb.auth.signOut(); });

    el['pnl-sidebar-toggle'].addEventListener('click', function (ev) {
      ev.stopPropagation();
      alternarSidebar();
    });
    el['pnl-sidebar'].addEventListener('click', function (ev) {
      if (ev.target.closest('.pnl-side-tab, .pnl-sidebar__logout, #pnl-sidebar-toggle')) return;
      if (!sidebarEstaExpandida()) alternarSidebar();
    });

    el['pnl-period'].addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-period]');
      if (!btn) return;
      state.dashPeriodo = btn.dataset.period;
      el['pnl-period'].querySelectorAll('.pnl-period-btn').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      carregarDashboard();
    });

    el['pnl-filters'].addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-filtro]');
      if (!btn) return;
      state.filtro = btn.dataset.filtro;
      render();
    });

    var buscaTimer;
    el['pnl-busca'].addEventListener('input', function (ev) {
      window.clearTimeout(buscaTimer);
      buscaTimer = window.setTimeout(function () {
        state.busca = ev.target.value;
        render();
      }, 150);
    });

    document.querySelectorAll('.pnl-view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.visualizacao = btn.dataset.view;
        document.querySelectorAll('.pnl-view-btn').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        aplicarVisualizacao();
      });
    });

    el['pnl-bulk-bar'].addEventListener('click', function (ev) {
      var bulkBtn = ev.target.closest('[data-bulk]');
      if (bulkBtn) { aplicarAcaoLote(bulkBtn.dataset.bulk); return; }
      if (ev.target === el['pnl-bulk-limpar']) {
        state.selecionados.clear();
        render();
        atualizarBarraSelecao();
      }
    });
    el['pnl-bulk-excluir'].addEventListener('click', function () {
      var produtos = Array.from(state.selecionados).map(encontrarProduto).filter(Boolean);
      if (produtos.length) abrirConfirm(produtos);
    });

    setupGridDelegation();

    el['pnl-novo'].addEventListener('click', function () { abrirModal(null, false); });
    el['pnl-modal-close'].addEventListener('click', fecharModal);
    el['pnl-modal-backdrop'].addEventListener('click', function (ev) {
      if (ev.target === el['pnl-modal-backdrop']) fecharModal();
    });

    el['pnl-condicao'].addEventListener('change', atualizarCampoBateria);

    el['pnl-cor-select'].addEventListener('change', function () {
      el['pnl-cor-outra-field'].hidden = el['pnl-cor-select'].value !== 'Outra';
    });

    el['pnl-foto'].addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (file) usarArquivoFoto(file);
    });

    var arrastesAtivos = 0;
    el['pnl-photo-field'].addEventListener('dragenter', function (ev) {
      ev.preventDefault();
      arrastesAtivos++;
      el['pnl-photo-field'].classList.add('is-dragover');
    });
    el['pnl-photo-field'].addEventListener('dragover', function (ev) { ev.preventDefault(); });
    el['pnl-photo-field'].addEventListener('dragleave', function (ev) {
      ev.preventDefault();
      arrastesAtivos = Math.max(0, arrastesAtivos - 1);
      if (arrastesAtivos === 0) el['pnl-photo-field'].classList.remove('is-dragover');
    });
    el['pnl-photo-field'].addEventListener('drop', function (ev) {
      ev.preventDefault();
      arrastesAtivos = 0;
      el['pnl-photo-field'].classList.remove('is-dragover');
      var file = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) usarArquivoFoto(file);
    });

    el['pnl-form-disponivel'].addEventListener('click', function () {
      trilho(el['pnl-form-disponivel'], el['pnl-form-disponivel'].dataset.on !== '1');
    });
    el['pnl-form-destaque'].addEventListener('click', function () {
      trilho(el['pnl-form-destaque'], el['pnl-form-destaque'].dataset.on !== '1');
    });

    el['pnl-form'].addEventListener('submit', submitForm);

    el['pnl-confirm-cancel'].addEventListener('click', fecharConfirm);
    el['pnl-confirm-delete'].addEventListener('click', confirmarExclusao);
    el['pnl-confirm-backdrop'].addEventListener('click', function (ev) {
      if (ev.target === el['pnl-confirm-backdrop']) fecharConfirm();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!el['pnl-confirm-backdrop'].hidden) fecharConfirm();
      else if (!el['pnl-modal-backdrop'].hidden) fecharModal();
    });
  }

  /* — Boot ---------------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();

    if (!window.supabase) {
      el['pnl-boot-error'].hidden = false;
      el['pnl-boot-error'].textContent = 'Não foi possível carregar o painel (a conexão com o Supabase não respondeu). Verifique sua internet e recarregue a página.';
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    setupEventos();

    /* Estado da sidebar (expandida/colapsada) salvo entre sessões. Aplicado
       aqui, antes de mostrarPainel() revelar qualquer coisa, então não há
       flash do estado errado. */
    var sidebarExpandidaSalva = false;
    try { sidebarExpandidaSalva = window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; } catch (error) { /* localStorage indisponível — mantém colapsada */ }
    aplicarEstadoSidebar(sidebarExpandidaSalva);

    /* Layout desktop (≥1024px): sidebar, tabela, etc. Os gráficos
       aparecem em qualquer largura e o próprio Chart.js já é responsive
       (redesenha sozinho quando o contêiner muda de tamanho), então não
       precisa recriar nada ao cruzar o breakpoint — só a visualização de
       Produtos (Grade/Tabela) depende da largura. */
    var mqlDesktop = window.matchMedia('(min-width: 1024px)');
    state.isDesktop = mqlDesktop.matches;
    mqlDesktop.addEventListener('change', function (ev) {
      state.isDesktop = ev.matches;
      if (!ev.matches) forcarVisualizacaoGrade();
      else aplicarVisualizacao();
    });

    /* onAuthStateChange dispara imediatamente com a sessão atual (evento
       INITIAL_SESSION), então não precisa de um getSession() em paralelo.
       TOKEN_REFRESHED/USER_UPDATED só renovam o token por baixo dos panos
       (o supabase-js já cuida disso sozinho) — reagir a eles recarregaria
       a aba atual do zero sem o usuário ter feito nada. */
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      if (session) mostrarPainel(); else mostrarLogin();
    });
  });
})();
