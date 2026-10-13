# Pagamento online — Brasa Burger

O site continua em demonstração e **não cobra valores**. Pix, cartão e dinheiro no recebimento são preferências do pedido de teste. A opção de pagamento online aparece desabilitada com uma explicação. Não há QR Code fictício nem formulário que solicite dados de cartão.

Foi preparado um adaptador opcional de **Mercado Pago Checkout Pro via Preferences API**, com Python padrão (`urllib`) e redirecionamento ao ambiente do provedor. O Mercado Pago é uma proposta configurável; nenhuma conta foi conectada, nenhuma credencial real foi utilizada e nenhum pagamento externo foi realizado neste trabalho. Os testes automatizados usam respostas simuladas, sem rede.

## O que está implementado

1. Configuração pública em `/api/shop`: apenas disponibilidade, provedor, modo e motivo. Segredos permanecem no ambiente do servidor.
2. Pedido online validado e precificado pelo servidor entra em `awaiting_payment`. O pedido usa uma chave própria para consultar ou iniciar pagamento.
3. `POST /api/orders/{id}/payment`, com `X-Order-Token`, cria ou reaproveita a preferência persistida do pedido. O adaptador usa o total em centavos, BRL e o ID do pedido como `external_reference`. Descontos e taxa de entrega já estão incluídos nesse total.
4. O recibo mostra um botão para preparar o pagamento e, depois, um link validado de Mercado Pago. A loja não recebe números de cartão. O pedido só prossegue após confirmação autoritativa.
5. `POST /api/payments/webhook` exige assinatura HMAC SHA256 de `x-signature` e `x-request-id`, usando **`data.id` da query da URL**. Duplicatas de `data.id`, campos repetidos na assinatura, assinaturas inválidas e timestamps fora de cinco minutos são rejeitados. São aceitos timestamps em segundos ou milissegundos. O ID da notificação não é o ID do pagamento.
6. O servidor consulta `/v1/payments/{id}` e confere ID, pedido, moeda, total exato, modo real, ausência de reembolso e status `approved`. Só então o pedido muda para `awaiting_confirmation`. A URL de retorno e os campos do corpo do webhook não aprovam pagamentos.

Os links de checkout exigem HTTPS, domínio exato `www.mercadopago.com.br` ou `www.mercadopago.com`, caminho de checkout e `pref_id` correspondente. O cliente também valida o link. A conexão do servidor ao provedor não segue redirecionamentos para outro host.

## Ativação futura

A versão atual mantém `store.demo: true`. Mesmo que variáveis sejam definidas por engano, uma loja de demonstração não habilita pagamentos. Para ativar futuramente, são necessárias uma conta comercial válida, a escolha e configuração do provedor, implantação HTTPS pública, condições reais de venda e homologação com o provedor. Isso deve ocorrer antes de receber clientes reais.

Somente no ambiente privado do servidor:

| Variável | Uso |
| --- | --- |
| `BRASA_PAYMENTS_ENABLED` | Valor explícito `1` permite ativação; sozinho não é suficiente. |
| `BRASA_MP_ACCESS_TOKEN` | Access Token da conta do Mercado Pago. Nunca colocar em HTML, JavaScript, repositório ou documento público. |
| `BRASA_MP_WEBHOOK_SECRET` | Segredo da assinatura criado em Suas integrações → Webhooks. |
| `BRASA_PUBLIC_ORIGIN` | Origem HTTPS pública da loja, sem caminho, query ou credenciais. |
| `BRASA_MP_COLLECTOR_ID` | Opcional: ID da conta vendedora; quando definido, também é conferido no pagamento. |

É necessário configurar no Mercado Pago o evento **payment** e o endpoint HTTPS público `/api/payments/webhook`. A aplicação retorna ao caminho `/brasa-burger/index.html?payment=return#pedidos` e abre a consulta de pedidos próprios salvos neste navegador. Sem referências salvas, mostra um aviso para consultar Meus pedidos. Esse retorno contém apenas uma indicação para consultar o status; nenhuma chave privada do pedido é incluída na URL e nenhum pagamento é aprovado pelo retorno.

O adaptador desta revisão está limitado a uma transação pelo total integral do pedido. Pagamento dividido em dois meios, captura parcial, assinaturas, reembolsos e chargebacks não são automatizados. Não habilitar pagamento dividido sem conciliar a ordem comercial e todas as transações. Reembolsos e conciliações exigem operação no provedor e revisão do fluxo da loja.

Preferências não cobram apenas por serem criadas. O servidor persiste e reaproveita uma preferência; o adaptador também envia uma chave determinística por pedido/valor. **A documentação de Preferences não estabelece aqui uma garantia de idempotência equivalente à da Payments API**: em falha indeterminada entre criação externa e persistência, a preferência e o pagamento devem ser conciliados antes de repetir uma operação. Não tratar timeout como pagamento recusado. Não iniciar uma segunda cobrança automaticamente.

## O que falta validar com uma conta do provedor

- Compras de teste de Pix e cartão, recusa, pagamento pendente, abandono e reabertura do mesmo checkout.
- Recepção e reenvio de webhooks reais, incluindo latência, timestamps e perda temporária de conectividade.
- Preferência persistida, correspondência da conta vendedora e conciliação de pagamentos duplicados.
- URLs no domínio definitivo, requisitos da conta comercial e meios de pagamento efetivamente disponíveis.
- Rotina de cancelamento/reembolso de pedido já pago, contestação e recuperação depois de falha de infraestrutura.

Os 13 testes unitários locais verificam bloqueio da demonstração, ativação explícita/HTTPS, uso do total do servidor, URLs, assinatura, repetição/tamper de notificações, valores decimais, referência, conta opcional e status autoritativo. Outros três testes no navegador verificam o bloqueio da opção online, a preparação do link e a rejeição de URL insegura, com API simulada. Um teste adicional cobre aprovação seguida de reembolso parcial ainda com status approved e bloqueio do avanço no atendimento até conciliação. Os 17 testes validam o código com mocks, **não a integração real do provedor**.

## Documentação oficial consultada

Consulta em 13 de outubro de 2026, com Context7 e páginas oficiais do Mercado Pago:

- [Visão geral de Checkout Pro via Preferences API](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/overview).
- [Criar preferência](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post).
- [Notificações e assinatura de webhook](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).
- [Teste de compras com Pix e cartão](https://www.mercadopago.com.br/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases?scope=prod).
- [Comparação com Checkout Pro via Orders API](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-orders/overview).

A documentação atual recomenda **Orders API para novas integrações** e continua oferecendo a API de preferências. Este adaptador conserva o contrato de preferências desta revisão. Antes da ativação comercial, considerar migrar para Orders API e homologar o fluxo escolhido; essa decisão não foi tomada nem ativada em uma conta real nesta tarefa.

## Contrato do módulo

`PaymentService(store, environ=None, transport=None, clock=None)` não faz chamada de rede na construção. `store` é o dicionário da loja. `public_config()` retorna campos públicos; `start(order)` retorna `{provider, preferenceId, url}`; `get_payment(id)` retorna um registro mínimo sem dados do pagador; `verify_payment(id, order, prefetched=None)` confere o registro autoritativo e retorna `approved`; `verify_signature(headers, query)` retorna booleano. `prefetched` só aceita dados normalizados por `get_payment`, usados internamente pelo servidor.

`PaymentError` expõe `status`, `message` e `code`, sem devolver texto bruto do provedor. O transporte injetável de testes recebe `(method, absoluteUrl, payload, headers)` e retorna um dicionário. Persistência de preferências, exclusão mútua e transições de pedido são responsabilidades do servidor.

No cliente, `payment-ui.js` usa `window.BrasaCommerce.api` e `.activeOrder`, escuta `brasa:ready`, `brasa:shop-change`, `brasa:payments-config` e `brasa:order-updated`, e publica `window.BrasaPayments.refresh(config)`, `.syncChoice()` e o getter `.onlineSelected`. O checkout inclui `#payment-online`, `#payment-receipt`, `#payment-online-help` e `#payment-receipt-options`. A área do recibo é criada pelo módulo. A opção online começa desabilitada no HTML e só é liberada após configuração pública validada do servidor. Pedidos com pagamento marcado para conciliação não oferecem uma nova tentativa de cobrança pelo recibo.
