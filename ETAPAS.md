# Melhorias da Brasa Burger

Esta entrega usa os dados de demonstração escolhidos pelo usuário. Nenhum pagamento real foi realizado e nenhum pedido foi enviado a uma cozinha externa.

| Etapa | Entrega | Como conferir |
| --- | --- | --- |
| 1. Entrega no início | Consulta por faixas de CEP com região, taxa, mínimo e prazo. O servidor recalcula a taxa ao registrar o pedido. Alterar CEP ou bairro invalida a consulta. | Use 00000-001, 00000-101 e 00000-201. São exemplos fictícios, sem consulta a endereços reais. |
| 2. Pix e cartão | Adaptador de checkout externo e confirmação de pagamento no servidor, com assinatura e conferência de valor, moeda e pedido. Cobrança bloqueada na demonstração. | Consulte PAGAMENTOS.md para ativação com credenciais privadas, HTTPS e homologação. Não foram usadas credenciais ou chamadas reais ao provedor. |
| 3. Produtos próprios | Painel recebe foto por produto e vídeo da cozinha. A foto substitui as imagens no cardápio, sugestões, personalização e sacola. Vídeo próprio recebe uma seção separada. | Entre no painel e abra “Fotos e vídeo próprios”. Nenhum material real da hamburgueria foi fornecido; a demonstração mantém fotos geradas por IA e filmagens licenciadas. |
| 4. Escolha rápida | “O clássico”, “Para muita fome” e “Vegetariano”, com foto, preço e personalização. | Veja “Três jeitos de acertar na fome”. Produtos esgotados ficam indisponíveis. Não há selo inventado de mais vendido. |
| 5. Combo personalizado | Burgers bovinos, de frango e vegetarianos podem receber porção e bebida. Total, adicionais, quantidade e economia aparecem antes da adição. | Um Brasa Clássico com batata e limonada custa R$ 49,80: R$ 4,90 abaixo da soma dos itens. |
| 6. Avaliações | Somente pedidos concluídos permitem avaliar sabor, embalagem e atendimento. Uma avaliação por pedido, com moderação antes de publicar. | Conclua um pedido pelo painel, avalie em “Meus pedidos” e publique pelo painel. Só primeiro nome e comentário são públicos. Nenhuma avaliação falsa foi adicionada à prévia. |
| 7. Clube | Cinco compras concluídas, agrupadas pelo telefone informado, dão R$ 12,90 para pedido futuro. Consulta exige chave de pedido próprio. Reserva atômica evita resgate duplicado; cancelamento devolve o benefício. | Consulte o clube com um pedido salvo neste navegador. Cupom e benefício não acumulam. |
| 8. Acompanhamento | Recibo e histórico consultam estados reais a cada 15 segundos enquanto abertos. Mudanças geram aviso. | Atualize um pedido pelo painel e observe o recibo aberto. Nenhum temporizador inventa preparo ou entrega. Não há notificação externa por WhatsApp/SMS. |
| 9. Operação | Pausa geral, produtos esgotados, acréscimo de prazo, moderação, mídias e contagens agregadas. | Abra as áreas Operação, Resultados, Avaliações e Fotos no painel. Visitas/sacolas/finalizações são eventos por carregamento da página, não visitantes únicos nem uma taxa de conversão individual. |

## Executar a prévia

Com Python 3.10 ou superior, execute na pasta do projeto:

```powershell
python server.py --port 4187 --state-dir CAMINHO_PRIVADO_FORA_DO_SITE
```

Loja: http://127.0.0.1:4187/brasa-burger/index.html

Painel: http://127.0.0.1:4187/brasa-burger/admin.html

A chave administrativa é gerada em `admin-key.txt` na pasta privada de dados. Ela nunca entra no ZIP público nem no armazenamento do navegador. Os arquivos `server.py`, `operations.py` e `payments.py` precisam ficar juntos.

## Antes da operação real

Preencha os dados reais de atendimento e configure as regiões de entrega; os CEPs atuais são fictícios. Envie fotos das receitas e vídeo da cozinha. Ajuste regras do clube e preços à sua operação. A configuração de pagamentos precisa passar pelos passos de PAGAMENTOS.md e pela homologação do provedor. O backend fornecido é um servidor de demonstração local; publicação de produção exige hospedagem, HTTPS, gestão de credenciais, backups e integração operacional apropriados.

O arquivo único `brasa-burger.html` mantém o filme e as fotos incorporados, personalização, combo e resumo offline. Consulta de entrega offline é identificada como simulação. Pedidos, clube, avaliações, pagamento e administração exigem o backend conectado.

## Evidências de validação

Testes em base privada e arquivos públicos separados na porta 4192. Pedidos e mídia de teste não entram na prévia 4187 nem no ZIP.

- 12 grupos de regressão do backend: validação dos valores, entrega, combos, disponibilidade, cancelamento, autorização, avaliações, eventos, upload, fidelidade concorrente e reconciliação de pagamentos.
- 17 testes de pagamentos com mocks, incluindo interface e reembolso parcial. Isso não equivale à homologação real do provedor.
- 9 grupos do módulo de experiência com API simulada: entrega, respostas atrasadas/offline, sugestões, fidelidade, avaliações, eventos e telas de 1440, 768, 390 e 320 pixels.
- Fluxo integrado em Edge: consulta, personalização, recibo, polling de status, avaliação moderada, refazer combo, clube, controles do painel e envio de mídia.

Os scripts e resultados desta revisão ficam em `work/brasa-burger-v7` no workspace. Outros navegadores e aparelhos físicos não foram testados.
