# Brasa Burger

Loja completa de demonstração, conforme escolha do usuário. Filme real de 89 segundos com oito etapas; 14 produtos entre burgers, combos, porções, bebidas e sobremesas; busca, categorias, favoritos e ordenação. Navegação e categorias acompanham a rolagem; a foto também abre a personalização.

“Me ajude a escolher” filtra os seis burgers por tipo, ingrediente da receita e preço máximo. Os critérios não são flexibilizados sem aviso; uma combinação sem produtos mostra como refazer a escolha. O orçamento considera a receita original, sem adicionais nem entrega. O cardápio alterna entre Fotos e Lista; a preferência fica neste navegador.

## Iniciar com pedidos salvos

Com Python 3.10 ou mais recente, abra um terminal na pasta brasa-burger e execute:

    python server.py --port 4187

Abra http://127.0.0.1:4187/brasa-burger/index.html. O servidor usa a biblioteca padrão do Python, sem instalar dependências, e salva pedidos em SQLite fora da pasta pública. O terminal informa a pasta de dados e o caminho de admin-key.txt.

O painel fica em http://127.0.0.1:4187/brasa-burger/admin.html. Abra o arquivo local admin-key.txt indicado pelo servidor, copie a chave e entre no painel. A chave fica somente na memória da página. Confirme, prepare, marque pronto/saiu para entrega, conclua ou cancele. O cliente consulta mudanças automaticamente a cada 15 segundos com recibo ou histórico aberto. Os estados não avançam sozinhos. O painel também controla produtos esgotados, pausa de pedidos, acréscimo de prazo, publicação de avaliações, mídias próprias e contagens agregadas.

Use --state-dir CAMINHO_FORA_DA_PASTA_PUBLICA para escolher a pasta de dados. BRASA_ADMIN_KEY pode fornecer uma chave própria com pelo menos 16 caracteres. Nunca publique os dados ou a chave junto do site.

## Novas melhorias

Consulte ETAPAS.md para conferir as nove etapas. Há três sugestões rápidas, combo personalizável, avaliações moderadas após pedidos concluídos e clube de demonstração: cinco compras concluídas geram R$ 12,90 para pedido futuro. O benefício exige acesso a pedido próprio, não acumula com cupom e é devolvido ao cancelar o pedido que o usou. Fotos e vídeo próprios podem ser enviados pelo painel; o material da sua loja ainda precisa ser fornecido.

## Jornada do cliente

Escolha um produto, veja composição/alérgenos, adicionais, ingredientes a retirar, observação e quantidade. “Editar item” na sacola reabre as opções escolhidas e salva sem criar uma linha duplicada. Combinações idênticas são unidas, respeitando o teto de 99 unidades. Os preços são calculados em centavos. A sacola fica neste navegador. BRASA10 dá 10% sobre produtos a partir de R$ 50, limitado a R$ 15; entrega não entra no desconto.

A personalização mostra total e preço por unidade com adicionais. A sacola sugere complementos com foto conforme as categorias escolhidas, sem repetir itens já presentes. “Usar cupom BRASA10” guarda o cupom na sacola e mostra quanto falta para o mínimo, quando necessário. “Desfazer” recupera a última remoção ou limpeza, inclusive personalizações e cupom; a próxima alteração dos itens ou do cupom invalida essa recuperação para preservar as novas escolhas. A recuperação não permanece após recarregar.

Consulte o CEP antes de escolher. As faixas fictícias desta demonstração são Centro (00000-001, R$ 6, 25–35 min), Vila Nova (00000-101, R$ 8, 35–45 min) e Jardim (00000-201, R$ 10, 40–50 min), com mínimo de R$ 20 em produtos. Escolha retirada ou entrega e preferência de pagamento no recebimento. Nenhuma cobrança, transação Pix ou envio à cozinha acontece. O servidor valida novamente dados, itens, extras, remoções, preço, cupom e taxa.

A escolha entre retirada e entrega também fica no navegador, para preservar a modalidade ao recarregar. A taxa exige uma nova consulta de CEP; o total fica identificado como parcial até confirmar a região. Ela não guarda endereço nem telefone sem a opção de consentimento do formulário.

Após registrar, consulte “Meus pedidos” neste navegador. A consulta exige a chave particular do pedido, guardada localmente. Cancele antes da confirmação. Tentativas repetidas do mesmo envio recuperam o pedido sem duplicação. “Refazer pedido” acrescenta itens à sacola com preços e opções do catálogo atual, para nova conferência; não registra outro pedido sozinho. Itens/opções indisponíveis são avisados, e o limite da sacola não permite adição parcial.

Nome, telefone e endereço só são lembrados se você marcar a opção correspondente. A sacola, os favoritos e o acesso aos pedidos ficam no armazenamento local. “Privacidade” no rodapé permite apagar dados do navegador; isso não apaga pedidos registrados no servidor.

## Arquivo único e hospedagem estática

brasa-burger.html, na pasta acima, contém filme em 720p, as 14 fotos individuais com versões responsivas, estilos e controles. Abra diretamente sem servidor. Sacola e personalização funcionam; checkout gera um resumo offline e não registra pedidos. Não há painel administrativo nesse modo.

Hospedagem apenas estática tem o mesmo limite. Registro e administração precisam do backend server.py. O servidor fornecido é uma demonstração local, com adaptador opcional de pagamento desativado na demonstração. Consulte PAGAMENTOS.md para configurar e homologar uma conta real do provedor. Suporte HTTP Range para navegação no vídeo já está implementado.

## Configurar a loja

store-data.js é a fonte única de produtos, preços, extras, cupom, endereço, horários e entrega para navegador e servidor. Preserve o formato window.BRASA_DATA = { ... }; com JSON estrito. Textos da estrutura ficam em index.html; informações de privacidade/condições em loja.js, privacidade.html e termos.html.

store.whatsapp está vazio. Informe um número real com país, DDD e telefone, só dígitos, para habilitar compartilhamento do resumo pelo cliente. Não use um número fictício. O cliente ainda precisa enviar a mensagem.

O modo cinema é o padrão, sem uma longa sequência de rolagem antes do cardápio. “Explorar com rolagem” ativa a experiência imersiva; “Voltar ao cinema” preserva a cena. No celular, os controles aparecem junto do filme, e o cinema mostra os detalhes completos de cada etapa. Capítulos/tempos/especificações em film-chapters.js. Há play/pausa, reinício, capítulos, linha do tempo, normal/0,75×/0,5× e tela cheia. Movimento reduzido desativa início automático e controle por rolagem. Save-Data desativa início automático e modo por rolagem e escolhe o vídeo menor. A versão desktop não é carregada antes da escolha do vídeo mobile. O filme não tem áudio.

O catálogo usa 14 fotografias individuais, cada uma gerada em 1254 × 1254 pixels. As antigas grades forneciam cerca de 444 ou 512 pixels por produto. A nova composição preserva a receita e amplia a definição de pão, carne, queijo, vegetais, acompanhamentos e bebidas. O navegador escolhe entre WebP de 640 e 1254 pixels conforme a tela e a densidade; miniaturas também usam esses arquivos. Isso evita carregar exportações enormes durante a compra. Os PNGs individuais originais continuam em assets/hd-sources no workspace e ficam fora do ZIP público. Estilos das fotos em media-quality.css; ajustes de legibilidade, navegação e sacola em refinements.css.

O pacote separado brasa-burger-imagens-8k.zip contém as 14 imagens quadradas ampliadas para 7680 × 7680 pixels, README e prompts. Essa exportação foi feita por interpolação de alta qualidade no Canvas do Edge a partir das fontes de 1254 × 1254. Não é geração nem captura nativa em 8K, e a ampliação não cria detalhes ópticos novos. O site usa as imagens em resolução nativa para manter a nitidez e o carregamento adequado.

As filmagens e seus quadros permanecem na resolução original disponível de 1920 × 1080 pixels. O servidor usa o filme Full HD no computador e a versão 1280 × 720 no celular ou com Save-Data; o arquivo único inclui 720p. O filme não foi convertido nem anunciado como 4K ou 8K.

Antes de operar uma loja real, substitua receitas, fotos, porções, dados de atendimento e políticas e integre a operação e o pagamento escolhidos. Regenere o arquivo único após editar.

## Fontes e validação

Fotos do cardápio geradas por IA com aparência fotográfica. Filme e quadros reais de Pilan Filmes e Katerina Holmes, licenciados pelo Pexels. Consulte PROMPTS.md, SOURCES-video.md, creditos.html e REFERENCIAS.md.

Validação em Edge real automatizado, telas de computador e celular simuladas. Os arquivos de geração, preparação e empacotamento desta revisão ficam em work/brasa-burger-v6. A versão anterior foi validada em work/brasa-burger-v5 e anteriores em work/brasa-burger-v4 e work/brasa-burger-v3: escolha guiada, catálogo/checkout, API/persistência, painel, layout e offline. O filme também foi validado em work/brasa-burger-v2. Aparelhos físicos e outros motores não foram testados.

## Validação desta revisão

A integração v7 foi testada com backend e arquivos públicos isolados na porta 4192, sem criar pedidos de teste na prévia 4187. Passaram 12 grupos do backend, 17 testes de pagamentos com mocks, 9 grupos do módulo de experiência e 9 grupos do fluxo integrado em Edge nas larguras 1440, 768, 390 e 320. Consulte ETAPAS.md. Scripts e evidências em work/brasa-burger-v7 no workspace.
