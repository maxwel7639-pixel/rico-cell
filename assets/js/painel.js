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

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
    editandoId: null,
    excluindoId: null,
    fotoArquivo: null,
    fotoPreviewUrl: '',
    salvando: false,
    dashPeriodo: '7d'
  };

  var el = {};

  function cacheEls() {
    [
      'pnl-boot', 'pnl-login', 'pnl-painel',
      'pnl-login-form', 'pnl-login-error', 'pnl-email', 'pnl-senha', 'pnl-login-submit',
      'pnl-logout',
      'pnl-tab-dashboard', 'pnl-tab-produtos', 'pnl-tab-btn-dashboard', 'pnl-tab-btn-produtos',
      'pnl-period', 'pnl-dash-demo', 'pnl-dash-error', 'pnl-dash-cards',
      'pnl-summary', 'pnl-warning', 'pnl-filters', 'pnl-grid', 'pnl-empty', 'pnl-load-error',
      'pnl-novo', 'pnl-modal-backdrop', 'pnl-modal-title', 'pnl-modal-close',
      'pnl-form', 'pnl-form-error', 'pnl-foto', 'pnl-photo-preview', 'pnl-photo-caption',
      'pnl-nome', 'pnl-categoria', 'pnl-cor-select', 'pnl-cor-outra-field', 'pnl-cor-outra',
      'pnl-form-disponivel', 'pnl-form-destaque', 'pnl-form-submit',
      'pnl-confirm-backdrop', 'pnl-confirm-text', 'pnl-confirm-cancel', 'pnl-confirm-delete',
      'pnl-toast'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function categoriaRotulo(valor) {
    var c = CATEGORIAS.filter(function (x) { return x.valor === valor; })[0];
    return c ? c.rotulo : valor;
  }

  function showToast(mensagem) {
    el['pnl-toast'].textContent = mensagem;
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
    el['pnl-tab-btn-dashboard'].classList.toggle('is-active', aba === 'dashboard');
    el['pnl-tab-btn-dashboard'].setAttribute('aria-selected', String(aba === 'dashboard'));
    el['pnl-tab-btn-produtos'].classList.toggle('is-active', aba === 'produtos');
    el['pnl-tab-btn-produtos'].setAttribute('aria-selected', String(aba === 'produtos'));

    if (aba === 'dashboard') carregarDashboard();
    else carregarProdutos();
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

  async function carregarDashboard() {
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

      renderDashboard(await resp.json());
    } catch (error) {
      el['pnl-dash-error'].hidden = false;
      el['pnl-dash-error'].textContent = 'Não foi possível carregar as métricas de anúncios.';
    } finally {
      el['pnl-dash-cards'].removeAttribute('aria-busy');
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
    return state.filtro === 'todos' ? state.produtos : state.produtos.filter(function (p) { return p.categoria === state.filtro; });
  }

  function cardTemplate(p) {
    var foto = p.imagem_url || PLACEHOLDER_FOTO;
    return (
      '<article class="pnl-card" data-id="' + p.id + '">' +
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
              '</div>' +
            '</div>' +
            '<div class="pnl-card__actions">' +
              '<button type="button" class="pnl-icon-btn" data-action="editar" aria-label="Editar" title="Editar">' +
                '<svg viewBox="0 0 256 256" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="m227.31 73.37-44.68-44.69a16 16 0 0 0-22.63 0L36.69 152A15.86 15.86 0 0 0 32 163.31V208a16 16 0 0 0 16 16h44.69a15.86 15.86 0 0 0 11.31-4.69L227.31 96a16 16 0 0 0 0-22.63ZM92.69 208H48v-44.69l88-88L180.69 120ZM192 108.68 147.31 64l24-24L216 84.68Z"></path></svg>' +
              '</button>' +
              '<button type="button" class="pnl-icon-btn" data-action="duplicar" aria-label="Duplicar" title="Duplicar">' +
                '<svg viewBox="0 0 256 256" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8Zm-56 176H48V96h112Zm48-48h-32V88a8 8 0 0 0-8-8H96V48h112Z"></path></svg>' +
              '</button>' +
              '<button type="button" class="pnl-icon-btn pnl-icon-btn--danger" data-action="excluir" aria-label="Excluir" title="Excluir">' +
                '<svg viewBox="0 0 256 256" fill="currentColor" width="17" height="17" aria-hidden="true"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16ZM96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Zm48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Z"></path></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="pnl-card__toggles">' +
            '<button type="button" class="pnl-toggle-btn" data-action="toggle-disponivel">' +
              '<span class="pnl-toggle' + (p.disponivel ? ' is-on' : '') + '"><span class="pnl-toggle__thumb"></span></span>' +
              '<span class="pnl-toggle-label' + (p.disponivel ? ' is-on' : '') + '">Disponível</span>' +
            '</button>' +
            '<button type="button" class="pnl-star-btn" data-action="toggle-destaque" aria-label="Destaque">' +
              '<svg class="' + (p.destaque ? 'is-on' : '') + '" viewBox="0 0 256 256" width="18" height="18" aria-hidden="true"><path d="M239.2 97.29a16 16 0 0 0-13.81-11L166 81.17 142.72 25.81a15.95 15.95 0 0 0-29.44 0L90 81.17 30.61 86.32a16 16 0 0 0-9.11 28.06l45 39.29-13.42 58.6a16 16 0 0 0 23.84 17.34L128 199.35l51.08 30.26a16 16 0 0 0 23.84-17.34l-13.42-58.6 45-39.29a16 16 0 0 0 4.7-17.09Z"></path></svg>' +
              '<span class="pnl-toggle-label pnl-toggle-label--gold' + (p.destaque ? ' is-on' : '') + '">Destaque</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderGrid() {
    var visiveis = produtosVisiveis();
    el['pnl-grid'].innerHTML = visiveis.map(cardTemplate).join('');
    el['pnl-empty'].hidden = visiveis.length !== 0;
  }

  function encontrarProduto(id) {
    return state.produtos.filter(function (p) { return String(p.id) === String(id); })[0];
  }

  function setupGridDelegation() {
    document.getElementById('pnl-grid').addEventListener('click', function (ev) {
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
  }

  async function alternarCampo(produto, campo) {
    var anterior = produto[campo];
    produto[campo] = !anterior;
    render();
    var res = await sb.from('produtos').update({ [campo]: produto[campo] }).eq('id', produto.id);
    if (res.error) {
      produto[campo] = anterior;
      render();
      showToast('Não foi possível atualizar. Tente novamente.');
    }
  }

  /* — Modal adicionar/editar/duplicar --------------------------------------- */

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

    trilho(el['pnl-form-disponivel'], produtoBase ? produtoBase.disponivel : true);
    trilho(el['pnl-form-destaque'], produtoBase ? produtoBase.destaque : false);

    atualizarPreviewFoto();
    el['pnl-form-error'].hidden = true;

    el['pnl-modal-backdrop'].hidden = false;
    el['pnl-nome'].focus();
  }

  function fecharModal() {
    el['pnl-modal-backdrop'].hidden = true;
    state.editandoId = null;
    state.fotoArquivo = null;
    state.fotoPreviewUrl = '';
    el['pnl-foto'].value = '';
  }

  function atualizarPreviewFoto() {
    if (state.fotoPreviewUrl) {
      el['pnl-photo-preview'].style.backgroundImage = "url('" + state.fotoPreviewUrl + "')";
      el['pnl-photo-caption'].textContent = 'Toque para trocar a imagem';
    } else {
      el['pnl-photo-preview'].style.backgroundImage = 'none';
      el['pnl-photo-caption'].textContent = 'Toque para escolher do celular';
    }
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

    var payload = {
      nome_modelo: nome,
      categoria: el['pnl-categoria'].value,
      cor: corFinal,
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
      showToast(eraEdicao ? 'Produto atualizado.' : 'Produto adicionado.');
    } catch (error) {
      setSalvando(false);
      el['pnl-form-error'].hidden = false;
      el['pnl-form-error'].textContent = 'Não foi possível salvar. ' + (error && error.message ? error.message : 'Tente novamente.');
    }
  }

  /* — Confirmação de exclusão ------------------------------------------------ */

  function abrirConfirm(produto) {
    state.excluindoId = produto.id;
    el['pnl-confirm-text'].textContent = '"' + produto.nome_modelo + '" sai da lista e deixa de aparecer no site.';
    el['pnl-confirm-backdrop'].hidden = false;
  }

  function fecharConfirm() {
    state.excluindoId = null;
    el['pnl-confirm-backdrop'].hidden = true;
  }

  async function confirmarExclusao() {
    var id = state.excluindoId;
    if (!id) return;
    el['pnl-confirm-delete'].disabled = true;
    var res = await sb.from('produtos').delete().eq('id', id);
    el['pnl-confirm-delete'].disabled = false;
    if (res.error) {
      showToast('Não foi possível excluir. Tente novamente.');
      return;
    }
    fecharConfirm();
    carregarProdutos();
    showToast('Produto excluído.');
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

    setupGridDelegation();

    el['pnl-novo'].addEventListener('click', function () { abrirModal(null, false); });
    el['pnl-modal-close'].addEventListener('click', fecharModal);
    el['pnl-modal-backdrop'].addEventListener('click', function (ev) {
      if (ev.target === el['pnl-modal-backdrop']) fecharModal();
    });

    el['pnl-cor-select'].addEventListener('change', function () {
      el['pnl-cor-outra-field'].hidden = el['pnl-cor-select'].value !== 'Outra';
    });

    el['pnl-foto'].addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      state.fotoArquivo = file;
      state.fotoPreviewUrl = URL.createObjectURL(file);
      atualizarPreviewFoto();
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
    setupEventos();

    /* onAuthStateChange dispara imediatamente com a sessão atual (evento
       INITIAL_SESSION), então não precisa de um getSession() em paralelo. */
    sb.auth.onAuthStateChange(function (_event, session) {
      if (session) mostrarPainel(); else mostrarLogin();
    });
  });
})();
