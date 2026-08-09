# Rico Cell — site institucional

Landing page da **Rico Cell** (Fortaleza / CE): iPhones, Android, eletrônicos e
assistência técnica, com conversão 100% pelo WhatsApp.

Implementação do design `Rico Cellshop.dc.html`
([projeto no Claude Design](https://claude.ai/design/p/20a09ff1-1252-4dc0-b497-4df8c5609742)),
convertido para HTML/CSS/JS estático — sem build, sem dependências, sem runtime.

## Estrutura

```
index.html              página inteira
assets/css/styles.css   tokens do design system "Nocturne" + camada de marca
assets/js/main.js       revelação ao rolar, tilt 3D, seletor de cor, carrossel
assets/img/             fotos da loja (as mesmas do projeto de design)

painel/index.html       rota /painel — abas Dashboard e Produtos
assets/css/painel.css   estilos da rota /painel
assets/js/painel.js     client Supabase, auth, CRUD de produtos e dashboard
api/ads-metrics.js      Vercel Function — métricas de anúncios (Meta Ads)
```

## Rodar localmente

Qualquer servidor estático serve:

```sh
npx serve .          # ou: python3 -m http.server 8000
```

Abrir `http://localhost:3000` (ou `:8000`).

## Painel (`/painel`)

Área restrita com duas abas: **Dashboard** (métricas de anúncios, aba padrão
ao entrar) e **Produtos** (cadastrar, editar, duplicar, excluir, alternar
**Disponível** / **Destaque**). O front-end é HTML/CSS/JS puro — `supabase-js`
é carregado via CDN (`unpkg.com/@supabase/supabase-js@2`), sem build e sem
passo de instalação. A única peça com backend é a função serverless do
dashboard (abaixo).

- **Projeto Supabase:** `rico-cell` (`bpncnintvpmpqfdtykms`, região `sa-east-1`).
- **Auth:** e-mail + senha via Supabase Auth. **Não existe cadastro público** —
  a tela de login só aceita usuários já criados. Para dar acesso a alguém,
  convide pelo painel do Supabase (Authentication → Users → Invite user); a
  pessoa define a senha pelo link do convite e já pode entrar em `/painel`.
- **Dados:** tabela `public.produtos` (`nome_modelo`, `categoria` —
  iphone/android/eletro —, `cor`, `imagem_url`, `disponivel`, `destaque`).
  RLS já publica só os `disponivel = true` para visitantes; usuários
  autenticados leem e escrevem tudo.
- **Fotos:** upload direto no formulário vai para o bucket público `produtos`
  no Storage; a URL pública fica em `imagem_url`.
- **Credenciais no código:** `assets/js/painel.js` tem a URL do projeto e a
  chave **publicável** (`sb_publishable_...`) hardcoded — isso é esperado
  nesse tipo de client-side estático (a chave publicável não dá acesso a
  nada além do que a RLS permite). Nunca coloque a chave `service_role` aqui.

Ao publicar em Vercel/Netlify, a pasta `painel/` com `index.html` já responde
em `/painel/`; no GitHub Pages pode ser necessário o `/` final na URL.

## Dashboard de anúncios (Meta Ads)

A aba **Dashboard** mostra Gasto total, Cliques, Impressões, CTR, CPC e
Resultados (conversas iniciadas), com seletor de período (7 ou 30 dias). Os
números vêm de `GET /api/ads-metrics?period=7d|30d`, uma Vercel Function
(`api/ads-metrics.js`, Node.js puro, sem dependências) que:

1. Exige um usuário logado — valida o token da sessão do Supabase Auth
   (enviado pelo painel no header `Authorization: Bearer ...`) chamando
   `/auth/v1/user` no próprio Supabase. Sem token válido, responde `401`.
2. Lê as variáveis de ambiente `META_ADS_ACCOUNT_ID` e `META_ADS_ACCESS_TOKEN`.
   **Configure as duas na Vercel em Settings → Environment Variables** —
   nunca no código. `META_ADS_ACCOUNT_ID` é o ID da conta de anúncios com o
   prefixo `act_` (ex.: `act_1234567890`).
3. **Enquanto qualquer uma das duas não existir**, o painel funciona em
   **modo demonstração**: a API devolve números fictícios (mas plausíveis)
   com `demo: true`, e o dashboard mostra o aviso "Mostrando dados de
   demonstração — conecte a conta de anúncios pra ver os números reais".
4. Com as duas configuradas, a API consulta a Graph API do Meta
   (`/{ad_account_id}/insights`) e devolve os números reais com `demo: false`.
   Se a consulta ao Meta falhar (token expirado, permissão faltando, etc.),
   a API responde `502` — o token de acesso nunca é exposto na resposta nem
   em log.

## Publicar

É um site estático puro — sobe direto em Vercel, Netlify, GitHub Pages ou
qualquer hospedagem comum. Não há passo de build: o diretório do repositório
**é** a saída.

## O que ainda depende de dados do cliente

| Item | Onde | O que fazer |
| --- | --- | --- |
| Pixel da Meta | `index.html`, `<head>` | Descomentar o bloco e trocar `META_PIXEL_ID_AQUI` |
| Google Tag / GA4 | `index.html`, `<head>` | Descomentar o bloco e trocar `GOOGLE_TAG_ID_AQUI` |
| Domínio nas tags Open Graph | `index.html`, `<head>` | Trocar `og:image` por uma URL absoluta quando o domínio existir |

Todos os links de WhatsApp apontam para **5585994226321** e já levam o
parâmetro `[origem: ...]` na mensagem, para dar pra medir de qual botão veio
cada conversa (hero, cards de produto, assistência, rodapé, botão flutuante).

## Fotos que ainda faltam

Herdado do mapa de imagens do projeto de design:

1. **Cores dos iPhones** — cada modelo tem hoje 1 foto real; as bolinhas cinza
   tracejadas são "sob consulta". Ao ter a foto de cada cor, preencher o
   `data-src` do botão `.swatch` e remover o atributo `data-mock`.
2. **Android individual** — os 3 cards usam recortes da mesma foto de balcão
   (`card__photo--crop-left|center|right`) e trazem o selo "Foto individual em
   breve". Trocar por uma foto de cada aparelho e remover o selo.
3. **Mais produtos** — acessórios, caixas de som, smartwatch.

Proporções ideais para fotos novas: produto **4:5** ou **1:1** com fundo preto
(o site usa `mix-blend-mode: lighten`, então o preto some e o aparelho parece
flutuar); antes/depois **3:4** com o mesmo enquadramento; depoimento vertical
**9:16**.

## Notas de implementação

- **Sem JavaScript a página continua inteira.** Os blocos nascem visíveis no
  HTML; o JS só "arma" a animação de entrada. Nada fica preso invisível se o
  script falhar.
- **Empilhamento no celular** (cards que ocupam a tela e deslizam uns sobre os
  outros) é CSS puro — `position: sticky` dentro de uma media query, não JS.
- **`prefers-reduced-motion`** desliga revelações, tilt, pulso do botão
  flutuante e a rolagem suave.
- Os *slots* de upload vazios do projeto de design (`<image-slot>`) não vieram:
  dependem do runtime do editor e, num site publicado, apareceriam como
  placeholders vazios e inertes. Para adicionar produtos, basta copiar um
  `<article class="card">` existente.
