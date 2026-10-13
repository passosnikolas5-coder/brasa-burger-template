"""Create only the static portfolio edition; never include private state."""
from pathlib import Path
from html.parser import HTMLParser
import argparse, json, re, shutil

ROOT=Path(__file__).resolve().parents[1]
DEMO='https://passosnikolas5-coder.github.io/brasa-burger-template/'
REPO='https://github.com/passosnikolas5-coder/brasa-burger-template'
STYLES=['styles.css','cooking.css','storefront.css','refinements.css','cart-enhancements.css','finder.css','polish.css','media-quality.css','experience.css','payment-ui.css','commerce-experience.css']
SCRIPTS=['store-data.js','commerce.js','film-chapters.js','cooking.js','loja.js','finder.js','shop-view.js','experience.js','payment-ui.js']
PAGES=['index.html','privacidade.html','termos.html','creditos.html']
class Inventory(HTMLParser):
    def __init__(self):super().__init__();self.refs=[];self.ids=[]
    def handle_starttag(self,tag,attributes):
        attrs=dict(attributes)
        if 'id' in attrs:self.ids.append(attrs['id'])
        for key in ['href','src','poster','data-desktop-src','data-mobile-src']:
            value=attrs.get(key,'')
            if value and not value.startswith(('#','https:','http:','data:','mailto:','tel:')):self.refs.append(value)
def build(destination):
    destination=destination.resolve()
    if destination!=ROOT/'public':raise ValueError('A saída deve ser o diretório public/ deste projeto.')
    destination.mkdir(exist_ok=True)
    data_text=(ROOT/'store-data.js').read_text(encoding='utf-8-sig').strip()
    data=json.loads(data_text[len('window.BRASA_DATA = '):-1])
    images=[f"assets/products/{p['id']}-{size}.webp" for p in data['products'] for size in [640,1254]]
    assets=['assets/favicon.svg',*images,'assets/video/preparo-real.mp4','assets/video/preparo-mobile.mp4','assets/video/burger-final-real.jpg','assets/video/cheese-griddle-real.jpg','assets/video/preparo.vtt']
    files=[*PAGES,*STYLES,*SCRIPTS,*assets]
    # Refuse a polluted output instead of deleting anything recursively.
    existing={str(path.relative_to(destination)).replace('\\','/') for path in destination.rglob('*') if path.is_file()}
    if existing-set(files)-{'.nojekyll','robots.txt','sitemap.xml'}:raise ValueError('public/ contém arquivos que não pertencem à vitrine. Use uma saída limpa.')
    for filename in files:
        source=ROOT/filename
        if not source.is_file():raise FileNotFoundError(filename)
        target=destination/filename;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    p=destination/'index.html';html=p.read_text(encoding='utf-8')
    html=html.replace('</head>','<script>window.BRASA_STATIC_DEMO = true;</script>\n</head>')
    html=html.replace('<title>Brasa Burger — da chapa à primeira mordida</title>','<title>Brasa Burger — modelo de hamburgueria</title>')
    html=html.replace('Loja de demonstração. Explore o cardápio e teste um pedido, sem cobrança.', 'Modelo de site para hamburguerias. Explore e monte seu pedido de demonstração, sem cobrança.')
    html=html.replace('Você pode explorar o cardápio, personalizar itens, aplicar o cupom e criar um pedido de teste. A loja não cobra nem envia o pedido a uma cozinha. Na prévia com servidor, o pedido é registrado e pode ser consultado.', 'Explore o cardápio, personalize itens, aplique o cupom e gere um resumo de demonstração. Esta página não registra compras, não cobra e não envia pedidos à cozinha. O modelo também possui uma versão conectada para demonstrar a operação da loja.')
    html=html.replace('Abra “Meus pedidos” para acompanhar. Enquanto o recibo ou histórico estiver aberto, o status é consultado automaticamente a cada 15 segundos. Você pode cancelar enquanto aguarda confirmação. As etapas mudam quando o painel da loja registra a atualização.', 'Esta apresentação gera um resumo e não registra compras. Acompanhamento e cancelamento ficam disponíveis na versão conectada à operação da loja, descrita na apresentação do projeto.')
    html=html.replace('Clube de demonstração. Pedidos cancelados não contam.', 'Benefício apresentado como exemplo. Compras não são contabilizadas nesta página.')
    html=html.replace('Avaliações ficam disponíveis após a conclusão do pedido e passam por moderação.', 'Na versão conectada à loja, pedidos concluídos podem avaliar após moderação. Esta apresentação não registra avaliações.')
    html=re.sub(r'<a id="admin-link"[^>]*>.*?</a>',f'<a href="{REPO}" target="_blank" rel="noopener">Sobre este modelo</a>',html)
    html=html.replace('content="assets/video/burger-final-real.jpg"',f'content="{DEMO}assets/video/burger-final-real.jpg"')
    html=html.replace('</head>',f'<link rel="canonical" href="{DEMO}">\n<meta property="og:url" content="{DEMO}">\n<meta name="twitter:card" content="summary_large_image">\n</head>')
    p.write_text(html,encoding='utf-8')
    # Make data-use descriptions accurately reflect this static edition.
    replacements={
      'Nome, telefone, endereço de entrega e observações são usados para registrar e consultar o pedido. Nesta loja de demonstração, o pedido permanece no servidor local e não é enviado a uma cozinha nem usado para cobrança.':'Nesta apresentação, nome, telefone, endereço e observações servem para montar o resumo no navegador. Não registramos pedidos em servidor, não enviamos à cozinha e não cobramos.',
      'Nome, telefone, endereço de entrega e observações são usados para registrar e consultar o pedido. Nesta demonstração, o pedido permanece no servidor local e não é enviado a uma cozinha nem usado para cobrança.':'Nesta apresentação, nome, telefone, endereço e observações servem para montar o resumo no navegador. Não registramos pedidos em servidor, não enviamos à cozinha e não cobramos.',
      'O painel registra contagens agregadas de visitas, sacolas e aberturas da conclusão do pedido. Esses eventos não incluem nome, telefone, CEP ou identificador persistente de visitante. Não há ferramentas de publicidade ou cadastro de marketing.':'Esta apresentação não envia eventos de visitas, sacolas ou pedidos para um painel. Não há ferramentas de publicidade ou cadastro de marketing. A hospedagem do GitHub pode processar dados técnicos de acesso conforme sua política de privacidade.',
      'O painel registra contagens agregadas de visitas, sacolas e aberturas da conclusão do pedido. Os eventos não incluem nome, telefone, CEP ou identificador persistente de visitante. Não há ferramentas de publicidade ou cadastro de marketing.':'Esta apresentação não envia eventos de visitas, sacolas ou pedidos para um painel. Não há ferramentas de publicidade ou cadastro de marketing. A hospedagem do GitHub pode processar dados técnicos de acesso conforme sua política de privacidade.',
      'Os pedidos registrados no servidor permanecem no histórico da loja.':'Nesta apresentação não há pedidos registrados em servidor.',
      'Pedidos registrados no servidor permanecem no histórico da loja.':'Nesta apresentação não há pedidos registrados em servidor.',
      'Após concluir um pedido, você pode avaliar sabor, embalagem e atendimento. Comentários aprovados exibem apenas o primeiro nome e o texto enviado; evite inserir dados pessoais no comentário. O clube agrupa compras concluídas pelo telefone informado, e a consulta exige a chave de um pedido seu.':'Avaliações e clube ilustram recursos da versão com servidor, que não está conectado nesta apresentação. Não há avaliações publicadas nem compras contabilizadas aqui.',
      'A avaliação exige um pedido concluído e passa por moderação. Apenas o primeiro nome e o comentário aprovado são publicados. Evite dados pessoais no comentário. Compras concluídas são agrupadas pelo telefone informado para contar benefícios do clube; a consulta exige a chave de um pedido seu.':'Avaliações e clube ilustram recursos da versão com servidor, que não está conectado nesta apresentação. Não há avaliações publicadas nem compras contabilizadas aqui.',
      'Confira itens, adicionais, ingredientes retirados, quantidades, endereço e preferência de pagamento antes de concluir. Pedidos registrados iniciam aguardando confirmação. A loja atualiza os estados de atendimento; eles não avançam automaticamente.':'Confira os itens e valores no resumo de demonstração. Esta página não registra compras. Confirmação, preparo, acompanhamento e cancelamento fazem parte da versão conectada à operação da loja.',
      'O pedido pode ser cancelado enquanto aguarda confirmação; depois disso, o atendimento é tratado pela loja.':'Nesta apresentação não há compras registradas para cancelar.',
      'É possível cancelar enquanto o pedido aguarda confirmação. Depois disso, o atendimento é tratado pela loja.':'Nesta apresentação não há compras registradas para cancelar. O cancelamento antes da confirmação pode ser demonstrado na versão conectada à loja.',
      'Cinco compras concluídas geram um benefício de R$ 12,90 para um pedido futuro. O resgate não acumula com BRASA10 e é devolvido se o pedido que o usou for cancelado.':'O clube apresenta um exemplo de benefício de R$ 12,90 a cada cinco compras concluídas. As compras e os resgates só são contabilizados na versão conectada à loja, sem acumular com BRASA10.',
      'Cinco compras concluídas geram R$ 12,90 para um pedido futuro. O resgate não acumula com BRASA10 e é devolvido se o pedido que o usou for cancelado.':'O clube apresenta um exemplo de benefício de R$ 12,90 a cada cinco compras concluídas. As compras e os resgates só são contabilizados na versão conectada à loja, sem acumular com BRASA10.',
    }
    for filename in ['loja.js','privacidade.html','termos.html']:
        p=destination/filename;source=p.read_text(encoding='utf-8')
        for before,after in replacements.items():source=source.replace(before,after)
        p.write_text(source,encoding='utf-8')
    (destination/'.nojekyll').write_text('',encoding='utf-8')
    (destination/'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {DEMO}sitemap.xml\n',encoding='utf-8')
    (destination/'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{DEMO}</loc></url></urlset>',encoding='utf-8')
    for filename in PAGES:
        inventory=Inventory();inventory.feed((destination/filename).read_text(encoding='utf-8'))
        if len(inventory.ids)!=len(set(inventory.ids)):raise ValueError('IDs duplicados em '+filename)
        for ref in inventory.refs:
            if not (destination/ref.split('?',1)[0]).is_file():raise ValueError(f'Referência ausente: {filename}: {ref}')
    print(json.dumps({'static_files':len(files)+3,'products':len(data['products']),'bytes':sum(p.stat().st_size for p in destination.rglob('*') if p.is_file()),'apiDisabled':True,'output':str(destination)}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,default=ROOT/'public');args=parser.parse_args();build(args.out if args.out.is_absolute() else ROOT/args.out)
