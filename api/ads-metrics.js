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

function dadosMock(periodo) {
  var base = periodo === '30d'
    ? { gastoTotal: 1840.32, cliques: 1420, impressoes: 68500, resultados: 96 }
    : { gastoTotal: 462.75, cliques: 356, impressoes: 17200, resultados: 24 };

  return {
    demo: true,
    periodo: periodo,
    gastoTotal: base.gastoTotal,
    cliques: base.cliques,
    impressoes: base.impressoes,
    ctr: Number(((base.cliques / base.impressoes) * 100).toFixed(2)),
    cpc: Number((base.gastoTotal / base.cliques).toFixed(2)),
    resultados: base.resultados
  };
}

function somarConversas(acoes) {
  return (acoes || [])
    .filter(function (a) { return /messaging_conversation_started/.test(a.action_type || ''); })
    .reduce(function (soma, a) { return soma + Number(a.value || 0); }, 0);
}

async function buscarMetaInsights(accountId, accessToken, periodo) {
  var datePreset = periodo === '30d' ? 'last_30d' : 'last_7d';
  var url = 'https://graph.facebook.com/' + META_GRAPH_VERSION + '/' + encodeURIComponent(accountId) +
    '/insights?fields=spend,impressions,clicks,ctr,cpc,actions&date_preset=' + datePreset +
    '&access_token=' + encodeURIComponent(accessToken);

  var resp = await fetch(url);
  var body = await resp.json();
  if (!resp.ok) {
    throw new Error('meta_graph_api_error');
  }

  var linha = (body.data && body.data[0]) || {};

  return {
    demo: false,
    periodo: periodo,
    gastoTotal: Number(linha.spend || 0),
    cliques: Number(linha.clicks || 0),
    impressoes: Number(linha.impressions || 0),
    ctr: Number(linha.ctr || 0),
    cpc: Number(linha.cpc || 0),
    resultados: somarConversas(linha.actions)
  };
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
