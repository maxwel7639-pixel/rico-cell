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

painel/index.html       rota /painel — gestão de produtos (login + CRUD)
assets/css/painel.css   estilos da rota /painel
assets/js/painel.js     client Supabase, auth e CRUD da tabela produtos
```

## Rodar localmente

Qualquer servidor estático serve:

```sh
npx serve .          # ou: python3 -m http.server 8000
```

Abrir `http://localhost:3000` (ou `:8000`).

## Painel de produtos (`/painel`)

Área restrita para gerenciar os produtos que aparecem no site — cadastrar,
editar, duplicar, excluir, e alternar **Disponível** / **Destaque**. Assim
como o resto do site, é HTML/CSS/JS puro: `supabase-js` é carregado via CDN
(`unpkg.com/@supabase/supabase-js@2`), sem build e sem passo de instalação.

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
