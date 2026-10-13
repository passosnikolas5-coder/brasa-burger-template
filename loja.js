(() => {
  'use strict';
  const data = window.BRASA_DATA;
  if (!data) return;
  const store = data.store;
  const byId = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
  const addressLine = `${store.address.street}, ${store.address.number}`;
  const addressCity = `${store.address.neighborhood} · ${store.address.city} / ${store.address.state}`;
  const fields = {pickupEstimate:store.pickupEstimate,deliveryEstimate:store.delivery.estimate,addressLine,addressCity,deliveryAreas:store.delivery.neighborhoods.join(', '),deliveryFee:`${money(Math.min(...store.delivery.zones.map(zone=>zone.feeCents)))} a ${money(Math.max(...store.delivery.zones.map(zone=>zone.feeCents)))}`,deliveryMinimum:money(store.delivery.minSubtotalCents)};
  document.querySelectorAll('[data-product-price]').forEach(node=>{const product=data.products.find(item=>item.id===node.dataset.productPrice);if(product)node.textContent=money(product.price);});
  document.querySelectorAll('[data-store]').forEach(node => { if (fields[node.dataset.store]) node.textContent = fields[node.dataset.store]; });
  const hours = byId('store-hours');
  if (hours) store.hours.forEach(day => {
    const row = document.createElement('div');
    for (const value of [day.days,day.time]) { const span=document.createElement('span');span.textContent=value;row.append(span); }
    hours.append(row);
  });
  const mobileToggle = byId('mobile-nav-toggle');
  const nav = byId('main-nav');
  function closeNavigation(restoreFocus=false) {
    const focusInside = nav?.contains(document.activeElement);
    nav?.classList.remove('is-open');mobileToggle?.setAttribute('aria-expanded','false');mobileToggle?.setAttribute('aria-label','Abrir navegação');
    if(restoreFocus && focusInside)mobileToggle?.focus({preventScroll:true});
  }
  mobileToggle?.addEventListener('click',() => {
    const open = nav.classList.toggle('is-open');
    mobileToggle.setAttribute('aria-expanded',String(open));
    mobileToggle.setAttribute('aria-label',open?'Fechar navegação':'Abrir navegação');
  });
  nav?.addEventListener('click',event => { if (event.target.closest('a')) closeNavigation(); });
  document.addEventListener('keydown',event => {if(event.key==='Escape')closeNavigation(true);});
  document.addEventListener('pointerdown',event=>{if(nav?.classList.contains('is-open')&&!nav.contains(event.target)&&!mobileToggle?.contains(event.target))closeNavigation();});
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href^="#"]');if(!link||link.hash.length<2)return;
    const section=byId(link.hash.slice(1));if(!section)return;
    const destination=section.querySelector('h1,h2')||section;destination.setAttribute('tabindex','-1');
    requestAnimationFrame(()=>destination.focus({preventScroll:true}));
  });
  const navLinks=[...nav?.querySelectorAll('a[href^="#"]')||[]];
  let navFrame=null;
  function updateNavigation(){
    navFrame=null;const boundary=(document.querySelector('.site-header')?.offsetHeight||76)+120;
    const current=navLinks.find(link=>{const section=byId(link.hash.slice(1));if(!section)return false;const rect=section.getBoundingClientRect();return rect.top<=boundary&&rect.bottom>boundary;});
    navLinks.forEach(link=>{if(link===current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',()=>{if(navFrame===null)navFrame=requestAnimationFrame(updateNavigation);},{passive:true});
  window.addEventListener('resize',()=>{if(innerWidth>760)closeNavigation();updateNavigation();},{passive:true});
  updateNavigation();
  document.querySelectorAll('[data-service-mode]').forEach(button => button.addEventListener('click',() => {
    const select=byId('fulfilment');select.value=button.dataset.serviceMode;select.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelectorAll('[data-service-mode]').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));
  }));
  byId('fulfilment')?.addEventListener('change',event=>document.querySelectorAll('[data-service-mode]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.serviceMode===event.target.value))));
  document.querySelectorAll('[data-open-orders]').forEach(button=>button.addEventListener('click',()=>byId('orders-open').click()));
  document.querySelectorAll('[data-close-cart]').forEach(link=>link.addEventListener('click',()=>byId('cart-dialog').close()));
  async function copy(value,button,label) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else { const textarea=document.createElement('textarea');textarea.value=value;textarea.style.position='fixed';textarea.style.left='-9999px';document.body.append(textarea);textarea.select();const ok=document.execCommand('copy');textarea.remove();if(!ok)throw Error('Copy failed'); }
      button.textContent=label;setTimeout(()=>button.textContent=button.dataset.originalLabel,2500);
    } catch { button.textContent=value;button.setAttribute('aria-label',`Copie este texto: ${value}`); }
  }
  const address=byId('copy-address');
  if(address){address.dataset.originalLabel='Copiar endereço';address.addEventListener('click',()=>copy(`${addressLine}, ${addressCity}`,address,'Endereço copiado'));}
  const policies = {
    privacy: {title:'Como seus dados são usados',sections:[
      ['Seu pedido',['Nome, telefone, endereço de entrega e observações são usados para registrar e consultar o pedido. Nesta loja de demonstração, o pedido permanece no servidor local e não é enviado a uma cozinha nem usado para cobrança.']],
      ['Neste navegador',['A sacola, os favoritos, a escolha entre entrega e retirada, o modo de visualizar o cardápio e as chaves para consultar seus próprios pedidos ficam no armazenamento local. Nome, telefone e endereço só são lembrados se você marcar “Lembrar meus dados neste navegador”. Nenhum dado de cartão é solicitado.']],
      ['Escolhas e dados',['O painel registra contagens agregadas de visitas, sacolas e aberturas da conclusão do pedido. Esses eventos não incluem nome, telefone, CEP ou identificador persistente de visitante. Não há ferramentas de publicidade ou cadastro de marketing. Você pode apagar os dados salvos neste navegador pelo botão abaixo. Os pedidos registrados no servidor permanecem no histórico da loja.']],
      ['Avaliações e clube',['Após concluir um pedido, você pode avaliar sabor, embalagem e atendimento. Comentários aprovados exibem apenas o primeiro nome e o texto enviado; evite inserir dados pessoais no comentário. O clube agrupa compras concluídas pelo telefone informado, e a consulta exige a chave de um pedido seu.']],
      ['Antes de operar uma loja real',['A política e o canal de atendimento precisam ser atualizados para refletir o responsável pela loja, os fornecedores e a operação real. Os dados atuais são de demonstração.']]
    ]},
    terms: {title:'Condições do pedido',sections:[
      ['Loja de demonstração',['Cardápio, preços, porções, endereço, horários e área de entrega são exemplos. As fotos do cardápio são geradas com IA; o filme de preparo usa filmagens reais licenciadas. Nenhuma compra ou cobrança é realizada nesta demonstração.']],
      ['Conferência e confirmação',['Confira itens, adicionais, ingredientes retirados, quantidades, endereço e preferência de pagamento antes de concluir. Pedidos registrados iniciam aguardando confirmação. A loja atualiza os estados de atendimento; eles não avançam automaticamente.']],
      ['Entrega, retirada e cancelamento',['Consulte o CEP: Centro custa R$ 6 (25–35 min), Vila Nova R$ 8 (35–45 min) e Jardim R$ 10 (40–50 min). Os CEPs são fictícios e os prazos podem receber um acréscimo no painel. A entrega exige R$ 20 em produtos. Retirada não tem taxa. O pedido pode ser cancelado enquanto aguarda confirmação; depois disso, o atendimento é tratado pela loja.']],
      ['Produtos e restrições',['Ingredientes e alérgenos apresentados são baseados nas receitas demonstrativas. Disponibilidade, porções e preparo devem ser confirmados com a loja real, especialmente em caso de restrição alimentar.']],
      ['Combo e clube',['Burgers bovinos, de frango e vegetarianos podem receber fritas ou onion rings e limonada ou milkshake com R$ 4,90 de desconto sobre a soma desses itens. Cinco compras concluídas geram um benefício de R$ 12,90 para um pedido futuro. O resgate não acumula com BRASA10 e é devolvido se o pedido que o usou for cancelado.']],
      ['Desconto de demonstração',['BRASA10 concede 10% sobre produtos a partir de R$ 50, limitado a R$ 15. A entrega não entra no desconto.']]
    ]}
  };
  window.BRASA_POLICIES = policies;
  const info=byId('info-dialog');
  let infoTrigger;
  document.querySelectorAll('[data-info]').forEach(link=>link.addEventListener('click',event=>{
    const policy=policies[link.dataset.info];if(!policy||!info)return;
    event.preventDefault();infoTrigger=link;byId('info-title').textContent=policy.title;
    const content=byId('info-content');content.replaceChildren();
    policy.sections.forEach(([title,paragraphs])=>{const heading=document.createElement('h3');heading.textContent=title;content.append(heading);paragraphs.forEach(text=>{const p=document.createElement('p');p.textContent=text;content.append(p);});});
    byId('clear-local-data').hidden=link.dataset.info!=='privacy';info.showModal();
  }));
  byId('info-close')?.addEventListener('click',()=>info.close());
  info?.addEventListener('close',()=>infoTrigger?.focus({preventScroll:true}));
  byId('clear-local-data')?.addEventListener('click',()=>{
    try{Object.keys(localStorage).filter(key=>key.startsWith('brasa-')).forEach(key=>localStorage.removeItem(key));}catch{}
    window.location.reload();
  });
  if(location.protocol==='file:')byId('admin-link')?.setAttribute('hidden','');
})();
