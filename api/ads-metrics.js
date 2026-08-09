/* Rico Cell — GET /api/ads-metrics?period=7d|30d
   Vercel Function (Node.js, sem dependências externas — usa fetch nativo).
   Exige um usuário autenticado no Supabase Auth (token do painel) e devolve
   métricas de anúncios: dados mockados (demo: true) se META_ADS_ACCOUNT_ID /
   META_ADS_ACCESS_TOKEN não estiverem configurados, ou dados reais da Graph
   API do Meta (demo: false) quando estiverem. */

var SUPABASE_URL = 'https://bpncnintvpmpqfdtykms.supabase.co';
var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vHbfOm4ncXqiq4mIDRll3Q_HtXkE4es';
var META_GRAPH_VERSION = 'v21.0';

async function usuarioAutenticado(req) {
  var auth = req.headers.authorization || '';
  var match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return false;

  try {
    var resp = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + match[1], apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    return resp.ok;
  } catch (error) {
    return false;
  }
}

var PESOS_CATEGORIA = [
  { categoria: 'iphone', peso: 0.55 },
  { categoria: 'android', peso: 0.30 },
  { categoria: 'eletro', peso: 0.15 }
];

/* O Meta Ads não expõe atribuição por categoria interna de produto nos
   insights de conta — isso é uma divisão proporcional ilustrativa, tanto
   no caminho mock quanto no real, reaproveitando o mesmo flag `demo` do
   restante da resposta. */
function dividirPorCategoria(resultadosTotal) {
  var base = PESOS_CATEGORIA.map(function (c) {
    return { categoria: c.categoria, resultados: Math.round(resultadosTotal * c.peso) };
  });
  var soma = base.reduce(function (s, c) { return s + c.resultados; }, 0);
  base[0].resultados += resultadosTotal - soma; // corrige o arredondamento
  return base;
}

function agregarSerie(serie) {
  var gastoTotal = Number(serie.reduce(function (s, d) { return s + d.gasto; }, 0).toFixed(2));
  var cliques = serie.reduce(function (s, d) { return s + d.cliques; }, 0);
  var impressoes = serie.reduce(function (s, d) { return s + d.impressoes; }, 0);
  return {
    gastoTotal: gastoTotal,
    cliques: cliques,
    impressoes: impressoes,
    ctr: impressoes ? Number(((cliques / impressoes) * 100).toFixed(2)) : 0,
    cpc: cliques ? Number((gastoTotal / cliques).toFixed(2)) : 0
  };
}

/* PRNG determinístico (mesma semente = mesma série a cada chamada, pra
   não ficar pulando de valor a cada reload) só pra dar uma variação
   "orgânica" à série mock em vez de dias idênticos. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gerarSerieDiariaMock(periodo) {
  var dias = periodo === '30d' ? 30 : 7;
  var rand = mulberry32(dias);
  var hoje = new Date();
  var serie = [];
  for (var i = dias - 1; i >= 0; i--) {
    var d = new Date(hoje);
    d.setDate(d.getDate() - i);
    var variacao = 0.75 + rand() * 0.5; // 0.75x-1.25x
    var impressoes = Math.round(2350 * variacao);
    var cliques = Math.round(impressoes * (0.018 + rand() * 0.006)); // ctr ~1.8%-2.4%, média ~2.07%
    var gasto = Number((cliques * (1.20 + rand() * 0.20)).toFixed(2)); // cpc ~1.20-1.40
    serie.push({ data: d.toISOString().slice(0, 10), gasto: gasto, cliques: cliques, impressoes: impressoes });
  }
  return serie;
}

function dadosMock(periodo) {
  var serieDiaria = gerarSerieDiariaMock(periodo);
  var agregados = agregarSerie(serieDiaria);
  // ~6.75% dos cliques viram conversa iniciada — mesma proporção implícita
  // nos números mock fixos anteriores (24/356 e 96/1420 ≈ 6.75%).
  var resultados = Math.round(agregados.cliques * 0.0675);

  return Object.assign(
    { demo: true, periodo: periodo, resultados: resultados, serieDiaria: serieDiaria, categorias: dividirPorCategoria(resultados) },
    agregados
  );
}

function somarConversas(acoes) {
  return (acoes || [])
    .filter(function (a) { return /messaging_conversation_started/.test(a.action_type || ''); })
    .reduce(function (soma, a) { return soma + Number(a.value || 0); }, 0);
}

async function buscarMetaInsights(accountId, accessToken, periodo) {
  var datePreset = periodo === '30d' ? 'last_30d' : 'last_7d';
  var url = 'https://graph.facebook.com/' + META_GRAPH_VERSION + '/' + encodeURIComponent(accountId) +
    '/insights?fields=spend,impressions,clicks,actions,date_start&time_increment=1&date_preset=' + datePreset +
    '&access_token=' + encodeURIComponent(accessToken);

  var resp = await fetch(url);
  var body = await resp.json();
  if (!resp.ok) {
    throw new Error('meta_graph_api_error');
  }

  var linhas = Array.isArray(body.data) ? body.data : [];
  var serieDiaria = linhas.map(function (l) {
    return { data: l.date_start, gasto: Number(l.spend || 0), cliques: Number(l.clicks || 0), impressoes: Number(l.impressions || 0) };
  });
  var agregados = agregarSerie(serieDiaria);
  var resultados = linhas.reduce(function (soma, l) { return soma + somarConversas(l.actions); }, 0);

  return Object.assign(
    { demo: false, periodo: periodo, resultados: resultados, serieDiaria: serieDiaria, categorias: dividirPorCategoria(resultados) },
    agregados
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await usuarioAutenticado(req))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  var periodo = req.query.period === '30d' ? '30d' : '7d';
  var accountId = process.env.META_ADS_ACCOUNT_ID;
  var accessToken = process.env.META_ADS_ACCESS_TOKEN;

  if (!accountId || !accessToken) {
    res.status(200).json(dadosMock(periodo));
    return;
  }

  try {
    res.status(200).json(await buscarMetaInsights(accountId, accessToken, periodo));
  } catch (error) {
    console.error('ads-metrics: falha ao consultar a Graph API do Meta');
    res.status(502).json({ error: 'meta_graph_api_error' });
  }
};
