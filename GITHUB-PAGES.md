# Publicação no GitHub Pages

A demonstração pública usa **GitHub Pages com GitHub Actions**. O conteúdo publicado é exclusivamente o diretório `public/`, selecionado no passo de upload do artefato. O restante do repositório reúne documentação e fontes para executar o modelo localmente.

## Organização do repositório

```text
.
├── .github/workflows/pages.yml   # Publicação do diretório public/
├── docs/preview.webp             # Imagem de apresentação do README
├── scripts/build-pages.py        # Prepara a versão estática
├── public/                       # Saída gerada; ignorada pelo Git
├── assets/                       # Mídias usadas pelo modelo
├── index.html                    # Interface original
├── store-data.js                 # Catálogo e dados da loja
├── server.py                     # Backend local de demonstração
├── operations.py                 # Operação, avaliações e clube
├── payments.py                   # Adaptador opcional de pagamento
├── README.md
└── GITHUB-PAGES.md
```

O workflow executa `python scripts/build-pages.py --out public` e utiliza as ações oficiais de Pages para preparar o ambiente, carregar um artefato e implantá-lo. O passo `actions/upload-pages-artifact` aponta para **`./public`**. Não altere esse caminho para `.`: isso publicaria conteúdo que não faz parte da vitrine. Configure o Pages do repositório para usar **GitHub Actions** como origem de publicação.

As fontes completas ficam na raiz do repositório público para apresentar o trabalho e permitir execução local. A preparação de `public/` inclui apenas a vitrine e suas mídias; exclui Python, painel administrativo e arquivos privados, e ativa a flag `BRASA_STATIC_DEMO=true`. Dados e segredos não devem ser enviados ao repositório, mesmo que não sejam selecionados para o artefato do Pages.

## O comportamento da demonstração

O Pages não executa Python ou SQLite. Na versão pública, o cardápio, o filme, a personalização, os combos e a sacola funcionam no navegador. A flag da demonstração estática evita tentativas de conexão à API local. A consulta de CEP é identificada como simulação, e a finalização produz um resumo offline. Ela não registra pedidos, não cobra Pix/cartão e não envia mensagens automaticamente.

Pedidos persistentes, acompanhamento, avaliações após conclusão, benefícios do clube, controles de operação e upload de mídia exigem o backend local descrito no README. O painel não deve ser apresentado como uma operação conectada à demonstração pública.

## Atualizar o modelo

1. Faça as alterações nas fontes da raiz e verifique a loja localmente.
2. Execute `python scripts/build-pages.py --out public`. Preserve os caminhos relativos para funcionar também na URL de um projeto do Pages. Não envie a saída gerada ao Git: o workflow a recria a partir das fontes.
3. Confirme que contatos, textos e identificação de demonstração refletem o propósito da apresentação. Não transforme dados de exemplo em promessas de atendimento real.
4. Envie a atualização à branch de publicação. O workflow gerará um novo artefato de `public/` e disponibilizará a implantação no ambiente `github-pages`.
5. Confira o link público em computador e celular, incluindo vídeo, imagens, consulta de CEP, personalização e resumo offline.

Não use o arquivo único com vídeos incorporados como página principal se a versão com arquivos separados já estiver disponível: as mídias separadas permitem carregamento e cache adequados. As exportações 8K e os PNGs de produção não são necessários à vitrine.

## Conteúdo que deve permanecer privado

Não enviar ao GitHub nem incluir no artefato:

- `admin-key.txt`, chaves de API, Access Tokens, segredos de webhook ou arquivos `.env` com credenciais.
- Bancos SQLite, arquivos `-wal` e `-shm`, pastas de estado, pedidos, nomes, telefones ou endereços de clientes.
- Uploads e mídia produzidos durante os testes, dados de QA, logs privados ou cópias de segurança.
- Pastas `__pycache__`, arquivos temporários e materiais históricos sem uso na demonstração.

O `.gitignore` ajuda a evitar inclusões acidentais, mas não remove arquivos já enviados. Se uma credencial for exposta, revogue-a no provedor e substitua-a; apagá-la apenas do último commit não elimina o histórico.

Fotos e filmagens utilizadas no site são conteúdo público da apresentação. Revise sua origem e as condições de uso antes de substituí-las ou distribuir o projeto para outro cliente. Os créditos e documentos do Pexels devem acompanhar os materiais correspondentes.
