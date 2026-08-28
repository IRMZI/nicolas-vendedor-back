/* eslint-disable no-console */
/**
 * Dados iniciais para demonstracao - loja de veiculos do Nicolas.
 * Executar com: npm run db:seed
 *
 * O seed e idempotente: rodar mais de uma vez nao duplica registros.
 */
import { PrismaClient, ProductStatus, ProductAvailability, AnalyticsEventType, DeviceType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Nicolas Vendedor';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nicolasvendedor.com.br';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';

const img = (seed: string, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function main() {
  console.log('> Criando usuario administrador...');
  const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: { name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash, role: 'ADMIN' },
  });

  console.log('> Criando configuracoes do site...');
  await prisma.setting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      siteName: 'Nicolas Vendedor',
      tagline: 'Seu proximo carro esta aqui - seminovos revisados e com procedencia',
      primaryColor: '#ea580c',
      secondaryColor: '#1c1917',
      phone: '(11) 4002-8922',
      whatsapp: '5511999998888',
      email: 'contato@nicolasvendedor.com.br',
      address: 'Av. dos Automoveis, 1200 - Sao Paulo/SP',
      businessHours: 'Segunda a sexta, 9h as 18h - Sabado, 9h as 14h',
      socialLinks: {
        instagram: 'https://instagram.com/nicolasvendedor',
        facebook: 'https://facebook.com/nicolasvendedor',
        youtube: null,
        tiktok: null,
        linkedin: null,
        x: null,
      },
      whatsappTemplate:
        'Ola, Nicolas! Vi o {produto} no seu site e gostaria de saber mais. Link: {link}',
      footerText:
        'Ha mais de 10 anos ajudando pessoas a encontrar o carro certo, com transparencia, procedencia verificada e negociacao justa.',
      aboutTitle: 'Quem e o Nicolas?',
      aboutContent:
        '<p>Trabalho com compra e venda de veiculos ha mais de 10 anos. Comecei vendendo o primeiro carro na garagem de casa e hoje mantenho um estoque selecionado de seminovos revisados.</p><p>Cada carro que anuncio passa por <strong>vistoria cautelar completa</strong>: laudo aprovado, historico de leilao e sinistro verificado, quilometragem conferida. O que esta no anuncio e o que voce recebe.</p><p>Aceito seu usado na troca, ajudo com o financiamento e faco toda a documentacao. Fale comigo direto no WhatsApp: sem robo, sem enrolacao.</p>',
      aboutImageUrl: img('nicolas-about', 800, 800),
      benefits: [
        { icon: 'shield-check', title: 'Procedencia garantida', description: 'Todos os carros com laudo cautelar aprovado e historico verificado.' },
        { icon: 'file-check', title: 'Documentacao inclusa', description: 'Transferencia e despachante por minha conta, sem surpresa no preco.' },
        { icon: 'coins', title: 'Aceito troca', description: 'Avalio seu usado na hora e uso como parte do pagamento.' },
        { icon: 'landmark', title: 'Financiamento facilitado', description: 'Trabalho com os principais bancos e busco a melhor taxa para voce.' },
      ],
      seoTitle: 'Nicolas Vendedor - Carros seminovos com procedencia',
      seoDescription:
        'Carros seminovos revisados, com laudo cautelar aprovado e negociacao direta pelo WhatsApp. Hatch, sedan, SUV e picapes em Sao Paulo.',
      seoKeywords: 'carros seminovos, comprar carro, revenda de carros, seminovos sp, carros usados com procedencia',
      cookieNotice:
        'Usamos cookies para melhorar sua experiencia e medir o desempenho do site. Ao continuar navegando, voce concorda com nossa politica de privacidade.',
      privacyPolicy:
        '<h2>Politica de Privacidade</h2><p>Este site coleta apenas os dados necessarios para responder aos seus contatos: nome, telefone e e-mail informados voluntariamente no formulario de interesse.</p><p>Metricas de navegacao sao registradas de forma anonima, sem identificacao pessoal, apenas para melhorar o site e o estoque anunciado.</p><p>Nenhum dado e vendido ou compartilhado com terceiros. Para solicitar a exclusao dos seus dados, fale conosco pelo WhatsApp.</p>',
      termsOfUse:
        '<h2>Termos de Uso</h2><p>Os precos exibidos no site sao informativos e podem variar sem aviso previo. A negociacao final acontece pessoalmente ou pelo WhatsApp.</p><p>As fotos sao dos proprios veiculos anunciados. Condicoes de financiamento dependem de analise de credito das instituicoes parceiras.</p><p>Os veiculos estao sujeitos a venda previa sem aviso.</p>',
    },
  });

  console.log('> Criando secoes da home...');
  const sections = [
    { key: 'hero', title: 'Banner principal', position: 0 },
    { key: 'categories', title: 'Encontre por categoria', subtitle: 'Hatch, sedan, SUV, picape: escolha o estilo do seu proximo carro', position: 1 },
    { key: 'featured', title: 'Destaques da semana', subtitle: 'Oportunidades selecionadas pelo Nicolas', position: 2 },
    { key: 'most_viewed', title: 'Os mais procurados', subtitle: 'Os carros que mais despertam interesse', position: 3 },
    { key: 'recent', title: 'Acabaram de chegar', subtitle: 'Ultimas entradas no estoque', position: 4 },
    { key: 'about', title: 'Sobre o Nicolas', position: 5 },
    { key: 'benefits', title: 'Por que comprar comigo', position: 6 },
    { key: 'testimonials', title: 'Quem comprou recomenda', position: 7 },
    { key: 'whatsapp_cta', title: 'Achou o carro certo?', subtitle: 'Chame no WhatsApp para agendar uma visita ou tirar duvidas', position: 8 },
  ];
  for (const section of sections) {
    await prisma.homeSection.upsert({
      where: { key: section.key },
      update: {},
      create: { ...section, isEnabled: true },
    });
  }

  console.log('> Criando categorias...');
  const categoriesData = [
    { name: 'Hatch', slug: 'hatch', icon: 'car', description: 'Compactos economicos, ideais para o dia a dia na cidade: baixo consumo e facil de estacionar.', showOnHome: true, position: 0 },
    { name: 'Sedan', slug: 'sedan', icon: 'car-front', description: 'Conforto e porta-malas grande para a familia e para viagens tranquilas.', showOnHome: true, position: 1 },
    { name: 'SUV', slug: 'suv', icon: 'truck', description: 'Posicao de dirigir elevada, espaco interno e a versatilidade que todo mundo procura.', showOnHome: true, position: 2 },
    { name: 'Picape', slug: 'picape', icon: 'truck', description: 'Forca para o trabalho e conforto para o lazer: picapes medias e compactas revisadas.', showOnHome: true, position: 3 },
    { name: 'Ate R$ 60 mil', slug: 'ate-60-mil', icon: 'badge-dollar-sign', description: 'Selecao de carros com preco acessivel, revisados e com procedencia verificada.', showOnHome: true, position: 4 },
    { name: 'Blindados', slug: 'blindados', icon: 'shield', description: 'Veiculos blindados com laudo e manutencao da blindagem em dia.', showOnHome: false, position: 5 },
  ];

  const categories: Record<string, string> = {};
  for (const data of categoriesData) {
    const category = await prisma.category.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        ...data,
        imageUrl: img(`cat-${data.slug}`, 900, 600),
        seoTitle: `${data.name} seminovos | Nicolas Vendedor`,
        seoDescription: data.description,
        isActive: true,
      },
    });
    categories[data.slug] = category.id;
  }

  console.log('> Criando tags...');
  const tagNames = ['Unico dono', 'IPVA pago', 'Revisado', 'Baixa quilometragem', 'Oferta', 'Recem chegado', 'Automatico', 'Flex', 'Diesel', 'Aceita troca'];
  const tags: Record<string, string> = {};
  for (const name of tagNames) {
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const tag = await prisma.tag.upsert({ where: { slug }, update: {}, create: { name, slug } });
    tags[slug] = tag.id;
  }

  console.log('> Criando veiculos...');
  type SeedProduct = {
    name: string;
    slug: string;
    sku: string;
    categories: string[];
    price: number;
    comparePrice?: number;
    short: string;
    description: string;
    availability?: ProductAvailability;
    featured?: boolean;
    tags: string[];
    attrs: Array<[string, string]>;
  };

  const products: SeedProduct[] = [
    {
      name: 'Volkswagen Polo TSI Comfortline 1.0 Turbo 2021',
      slug: 'volkswagen-polo-tsi-comfortline-2021',
      sku: 'NV-2101',
      categories: ['hatch'], price: 84900, comparePrice: 89900,
      short: 'Polo TSI automatico, unico dono, 42 mil km, revisoes na concessionaria.',
      description: '<p><strong>Volkswagen Polo Comfortline 200 TSI 2021</strong>, automatico de 6 marchas, na cor cinza platinum.</p><ul><li>Unico dono, com manual e chave reserva</li><li>42.000 km com todas as revisoes na concessionaria</li><li>Central multimidia com CarPlay/Android Auto</li><li>Laudo cautelar aprovado</li></ul><p>Aceito seu usado na troca e financio em ate 60x.</p>',
      featured: true,
      tags: ['unico-dono', 'revisado', 'automatico', 'flex', 'aceita-troca'],
      attrs: [['Ano/Modelo', '2020/2021'], ['Quilometragem', '42.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Cinza Platinum'], ['Motor', '1.0 TSI 128 cv'], ['Portas', '4'], ['Final da placa', '7']],
    },
    {
      name: 'Chevrolet Onix LTZ 1.0 Turbo 2022',
      slug: 'chevrolet-onix-ltz-turbo-2022',
      sku: 'NV-2202',
      categories: ['hatch'], price: 79900,
      short: 'Onix LTZ turbo manual, 35 mil km, IPVA 2026 pago, pneus novos.',
      description: '<p><strong>Chevrolet Onix LTZ 1.0 Turbo 2022</strong> na cor branco summit.</p><ul><li>35.000 km, segunda dona</li><li>IPVA 2026 totalmente pago</li><li>Pneus novos, freios revisados</li><li>MyLink com espelhamento sem fio</li></ul>',
      featured: true,
      tags: ['ipva-pago', 'revisado', 'flex'],
      attrs: [['Ano/Modelo', '2021/2022'], ['Quilometragem', '35.000 km'], ['Cambio', 'Manual 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Branco Summit'], ['Motor', '1.0 Turbo 116 cv'], ['Portas', '4'], ['Final da placa', '2']],
    },
    {
      name: 'Fiat Argo Drive 1.3 2023',
      slug: 'fiat-argo-drive-2023',
      sku: 'NV-2303',
      categories: ['hatch', 'ate-60-mil'], price: 59900, comparePrice: 64900,
      short: 'Argo Drive 1.3 com apenas 18 mil km, na garantia de fabrica ate 2026.',
      description: '<p><strong>Fiat Argo Drive 1.3 Firefly 2023</strong>, vermelho monte carlo, ainda na garantia de fabrica.</p><ul><li>18.000 km, unico dono</li><li>Garantia Fiat ate outubro de 2026</li><li>Ar, direcao eletrica, vidros e travas</li></ul>',
      featured: true,
      tags: ['unico-dono', 'baixa-quilometragem', 'oferta', 'flex'],
      attrs: [['Ano/Modelo', '2022/2023'], ['Quilometragem', '18.000 km'], ['Cambio', 'Manual 5 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Vermelho Monte Carlo'], ['Motor', '1.3 Firefly 107 cv'], ['Portas', '4'], ['Final da placa', '9']],
    },
    {
      name: 'Toyota Corolla XEi 2.0 2021',
      slug: 'toyota-corolla-xei-2021',
      sku: 'NV-2104',
      categories: ['sedan'], price: 124900, comparePrice: 132000,
      short: 'Corolla XEi automatico CVT, 55 mil km, todas as revisoes Toyota, impecavel.',
      description: '<p><strong>Toyota Corolla XEi 2.0 Dynamic Force 2021</strong>, prata supernova, o sedan mais desejado do Brasil.</p><ul><li>55.000 km com historico completo Toyota</li><li>Cambio CVT com simulacao de 10 marchas</li><li>Toyota Safety Sense (ACC, frenagem automatica)</li><li>Bancos em couro, chave presencial</li></ul>',
      featured: true,
      tags: ['revisado', 'automatico', 'flex', 'aceita-troca'],
      attrs: [['Ano/Modelo', '2020/2021'], ['Quilometragem', '55.000 km'], ['Cambio', 'Automatico CVT'], ['Combustivel', 'Flex'], ['Cor', 'Prata Supernova'], ['Motor', '2.0 177 cv'], ['Portas', '4'], ['Final da placa', '5']],
    },
    {
      name: 'Honda Civic EXL 2.0 2020',
      slug: 'honda-civic-exl-2020',
      sku: 'NV-2005',
      categories: ['sedan'], price: 112900,
      short: 'Civic EXL automatico, 61 mil km, unico dono, teto solar e couro.',
      description: '<p><strong>Honda Civic EXL 2.0 2020</strong> azul cosmico, unico dono com todas as revisoes em dia.</p><ul><li>61.000 km reais e conferidos</li><li>Teto solar eletrico e bancos em couro</li><li>Sensores dianteiros e traseiros, camera de re</li></ul>',
      tags: ['unico-dono', 'automatico', 'flex'],
      attrs: [['Ano/Modelo', '2019/2020'], ['Quilometragem', '61.000 km'], ['Cambio', 'Automatico CVT'], ['Combustivel', 'Flex'], ['Cor', 'Azul Cosmico'], ['Motor', '2.0 155 cv'], ['Portas', '4'], ['Final da placa', '1']],
    },
    {
      name: 'Hyundai HB20S Vision 1.6 2022',
      slug: 'hyundai-hb20s-vision-2022',
      sku: 'NV-2206',
      categories: ['sedan', 'ate-60-mil'], price: 66900,
      short: 'HB20S Vision automatico, 38 mil km, otimo custo-beneficio para a familia.',
      description: '<p><strong>Hyundai HB20S Vision 1.6 automatico 2022</strong>, prata brisk.</p><ul><li>38.000 km, revisado com laudo aprovado</li><li>Porta-malas de 460 litros</li><li>Central blueMedia com espelhamento</li></ul>',
      tags: ['automatico', 'revisado', 'flex', 'aceita-troca'],
      attrs: [['Ano/Modelo', '2021/2022'], ['Quilometragem', '38.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Prata Brisk'], ['Motor', '1.6 130 cv'], ['Portas', '4'], ['Final da placa', '4']],
    },
    {
      name: 'Jeep Compass Longitude 1.3 T270 2022',
      slug: 'jeep-compass-longitude-t270-2022',
      sku: 'NV-2207',
      categories: ['suv'], price: 139900, comparePrice: 147000,
      short: 'Compass Longitude turbo flex, 44 mil km, revisado, pacote de tecnologia completo.',
      description: '<p><strong>Jeep Compass Longitude T270 2022</strong>, cinza sting, o SUV medio mais vendido do pais.</p><ul><li>44.000 km com revisoes na autorizada</li><li>Motor 1.3 turbo flex de 185 cv</li><li>Painel digital de 10.25", multimidia de 10.1"</li><li>Frenagem autonoma e alerta de faixa</li></ul>',
      featured: true,
      tags: ['revisado', 'automatico', 'flex', 'aceita-troca'],
      attrs: [['Ano/Modelo', '2021/2022'], ['Quilometragem', '44.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Cinza Sting'], ['Motor', '1.3 T270 185 cv'], ['Portas', '5'], ['Final da placa', '8']],
    },
    {
      name: 'Volkswagen T-Cross Highline 1.4 TSI 2021',
      slug: 'volkswagen-t-cross-highline-2021',
      sku: 'NV-2108',
      categories: ['suv'], price: 119900,
      short: 'T-Cross Highline 1.4 TSI, teto solar, 49 mil km, unico dono.',
      description: '<p><strong>VW T-Cross Highline 250 TSI 2021</strong> branco cristal, versao top de linha.</p><ul><li>49.000 km, unico dono</li><li>Teto solar panoramico</li><li>ACC, sensor de ponto cego e camera de re</li><li>Rodas 17" originais</li></ul>',
      featured: true,
      tags: ['unico-dono', 'automatico', 'flex'],
      attrs: [['Ano/Modelo', '2020/2021'], ['Quilometragem', '49.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Branco Cristal'], ['Motor', '1.4 TSI 150 cv'], ['Portas', '5'], ['Final da placa', '3']],
    },
    {
      name: 'Hyundai Creta Prestige 2.0 2020',
      slug: 'hyundai-creta-prestige-2020',
      sku: 'NV-2009',
      categories: ['suv'], price: 98900, comparePrice: 104900,
      short: 'Creta Prestige 2.0 automatico, teto solar, couro, 68 mil km revisados.',
      description: '<p><strong>Hyundai Creta Prestige 2.0 2020</strong>, preto onix, completo.</p><ul><li>68.000 km com historico de manutencao</li><li>Teto solar, bancos em couro, chave presencial</li><li>IPVA 2026 pago</li></ul>',
      tags: ['ipva-pago', 'automatico', 'oferta', 'flex'],
      attrs: [['Ano/Modelo', '2019/2020'], ['Quilometragem', '68.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Preto Onix'], ['Motor', '2.0 166 cv'], ['Portas', '5'], ['Final da placa', '6']],
    },
    {
      name: 'Toyota Hilux SRV 2.8 Diesel 4x4 2021',
      slug: 'toyota-hilux-srv-diesel-2021',
      sku: 'NV-2110',
      categories: ['picape'], price: 219900,
      short: 'Hilux SRV diesel 4x4 automatica, 72 mil km, sem detalhes, pronta para tudo.',
      description: '<p><strong>Toyota Hilux SRV 2.8 turbodiesel 4x4 2021</strong>, prata metalico, cabine dupla.</p><ul><li>72.000 km, revisoes em dia</li><li>Cacamba com protetor e capota maritima</li><li>Laudo cautelar aprovado, sem passagem por leilao</li></ul>',
      featured: true,
      tags: ['diesel', 'automatico', 'revisado', 'aceita-troca'],
      attrs: [['Ano/Modelo', '2020/2021'], ['Quilometragem', '72.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Diesel'], ['Cor', 'Prata Metalico'], ['Motor', '2.8 Turbodiesel 204 cv'], ['Tracao', '4x4'], ['Final da placa', '0']],
    },
    {
      name: 'Fiat Toro Freedom 1.8 Flex 2021',
      slug: 'fiat-toro-freedom-2021',
      sku: 'NV-2111',
      categories: ['picape'], price: 102900, comparePrice: 109900,
      short: 'Toro Freedom automatica flex, 58 mil km, a picape que faz de tudo.',
      description: '<p><strong>Fiat Toro Freedom 1.8 AT6 2021</strong>, cinza silverstone.</p><ul><li>58.000 km, segunda dona</li><li>Multimidia de 7" com espelhamento</li><li>Cacamba de 937 litros com capota</li></ul>',
      tags: ['automatico', 'flex', 'oferta'],
      attrs: [['Ano/Modelo', '2020/2021'], ['Quilometragem', '58.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Cinza Silverstone'], ['Motor', '1.8 139 cv'], ['Portas', '4'], ['Final da placa', '7']],
    },
    {
      name: 'Fiat Strada Endurance 1.4 CS 2022',
      slug: 'fiat-strada-endurance-2022',
      sku: 'NV-2212',
      categories: ['picape', 'ate-60-mil'], price: 74900,
      short: 'Strada Endurance cabine simples, 29 mil km, ideal para o trabalho.',
      description: '<p><strong>Fiat Strada Endurance 1.4 cabine simples 2022</strong>, branco banchisa.</p><ul><li>29.000 km, unico dono (pessoa juridica)</li><li>Cacamba de 1.354 litros</li><li>Direcao hidraulica, ar-condicionado</li></ul>',
      tags: ['unico-dono', 'baixa-quilometragem', 'flex'],
      attrs: [['Ano/Modelo', '2021/2022'], ['Quilometragem', '29.000 km'], ['Cambio', 'Manual 5 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Branco Banchisa'], ['Motor', '1.4 Fire 88 cv'], ['Cabine', 'Simples'], ['Final da placa', '2']],
    },
    {
      name: 'Renault Kwid Zen 1.0 2023',
      slug: 'renault-kwid-zen-2023',
      sku: 'NV-2313',
      categories: ['hatch', 'ate-60-mil'], price: 52900,
      short: 'Kwid Zen 2023 com 12 mil km, na garantia, o carro zero km de entrada mais barato.',
      description: '<p><strong>Renault Kwid Zen 1.0 2023</strong>, branco glacier, praticamente zero.</p><ul><li>12.000 km, unico dono</li><li>Garantia de fabrica ate 2026</li><li>4 airbags, controle de estabilidade</li><li>Consumo de ate 15,3 km/l na estrada</li></ul>',
      tags: ['unico-dono', 'baixa-quilometragem', 'recem-chegado', 'flex'],
      attrs: [['Ano/Modelo', '2022/2023'], ['Quilometragem', '12.000 km'], ['Cambio', 'Manual 5 marchas'], ['Combustivel', 'Flex'], ['Cor', 'Branco Glacier'], ['Motor', '1.0 SCe 71 cv'], ['Portas', '4'], ['Final da placa', '5']],
    },
    {
      name: 'Toyota Corolla Cross XRE 2.0 2022',
      slug: 'toyota-corolla-cross-xre-2022',
      sku: 'NV-2214',
      categories: ['suv'], price: 152900,
      short: 'Corolla Cross XRE, 39 mil km, unico dono, o SUV que nao desvaloriza.',
      description: '<p><strong>Toyota Corolla Cross XRE 2.0 2022</strong>, branco polar, impecavel.</p><ul><li>39.000 km, unico dono, revisoes Toyota</li><li>Toyota Safety Sense completo</li><li>Rodas 18", bancos em couro</li></ul>',
      availability: ProductAvailability.ON_ORDER,
      tags: ['unico-dono', 'automatico', 'flex', 'recem-chegado'],
      attrs: [['Ano/Modelo', '2021/2022'], ['Quilometragem', '39.000 km'], ['Cambio', 'Automatico CVT'], ['Combustivel', 'Flex'], ['Cor', 'Branco Polar'], ['Motor', '2.0 177 cv'], ['Portas', '5'], ['Situacao', 'Em preparacao - disponivel em 3 dias']],
    },
    {
      name: 'Chevrolet S10 High Country 2.8 Diesel 2020',
      slug: 'chevrolet-s10-high-country-2020',
      sku: 'NV-2015',
      categories: ['picape'], price: 189900, comparePrice: 199900,
      short: 'S10 High Country diesel 4x4, 85 mil km, top de linha com tudo funcionando.',
      description: '<p><strong>Chevrolet S10 High Country 2.8 CTDI 4x4 2020</strong>, vermelho chili.</p><ul><li>85.000 km com manutencao em dia</li><li>Interior em couro caramelo</li><li>MyLink 8", OnStar, sensores e camera</li></ul>',
      tags: ['diesel', 'automatico', 'oferta', 'aceita-troca'],
      attrs: [['Ano/Modelo', '2019/2020'], ['Quilometragem', '85.000 km'], ['Cambio', 'Automatico 6 marchas'], ['Combustivel', 'Diesel'], ['Cor', 'Vermelho Chili'], ['Motor', '2.8 Turbodiesel 200 cv'], ['Tracao', '4x4'], ['Final da placa', '9']],
    },
    {
      name: 'Toyota Corolla Altis Hybrid 1.8 Blindado 2021',
      slug: 'toyota-corolla-altis-hybrid-blindado-2021',
      sku: 'NV-2116',
      categories: ['sedan', 'blindados'], price: 164900,
      short: 'Corolla Altis Hybrid blindado nivel III-A, 51 mil km, economia e seguranca.',
      description: '<p><strong>Toyota Corolla Altis Hybrid 2021</strong> com blindagem nivel III-A executada em 2021.</p><ul><li>51.000 km, blindagem com laudo e garantia</li><li>Vidros com menos de 5 anos</li><li>Media real de 16 km/l na cidade</li></ul>',
      tags: ['automatico', 'revisado'],
      attrs: [['Ano/Modelo', '2020/2021'], ['Quilometragem', '51.000 km'], ['Cambio', 'Automatico CVT'], ['Combustivel', 'Hibrido flex'], ['Cor', 'Preto Eclipse'], ['Blindagem', 'Nivel III-A (2021)'], ['Motor', '1.8 Hibrido 122 cv'], ['Final da placa', '4']],
    },
  ];

  const productIds: Array<{ id: string; slug: string; catId: string }> = [];
  for (const [index, item] of products.entries()) {
    const existing = await prisma.product.findUnique({ where: { slug: item.slug } });
    if (existing) {
      productIds.push({ id: existing.id, slug: item.slug, catId: categories[item.categories[0]] });
      continue;
    }

    const createdAt = new Date(Date.now() - (products.length - index) * 36 * 60 * 60 * 1000);
    const product = await prisma.product.create({
      data: {
        name: item.name,
        slug: item.slug,
        sku: item.sku,
        shortDescription: item.short,
        description: item.description,
        price: item.price,
        comparePrice: item.comparePrice ?? null,
        stock: 1,
        trackStock: true,
        status: ProductStatus.ACTIVE,
        availability: item.availability ?? ProductAvailability.IN_STOCK,
        isFeatured: item.featured ?? false,
        seoTitle: `${item.name} | Nicolas Vendedor`,
        seoDescription: item.short,
        publishedAt: createdAt,
        createdAt,
        categories: {
          create: item.categories.map((slug) => ({ categoryId: categories[slug] })),
        },
        tags: { create: item.tags.filter((slug) => tags[slug]).map((slug) => ({ tagId: tags[slug] })) },
        images: {
          create: [0, 1, 2, 3].map((position) => ({
            url: img(`${item.slug}-${position}`, 1200, 900),
            alt: `${item.name} - foto ${position + 1}`,
            position,
            isPrimary: position === 0,
            width: 1200,
            height: 900,
            mimeType: 'image/jpeg',
          })),
        },
        attributes: {
          create: item.attrs.map(([name, value], position) => ({ name, value, position })),
        },
      },
    });
    productIds.push({ id: product.id, slug: item.slug, catId: categories[item.categories[0]] });
  }

  console.log('> Criando banners...');
  const bannersData = [
    {
      title: 'Seu proximo carro com procedencia garantida',
      subtitle: 'Seminovos revisados, laudo cautelar aprovado e negociacao direta com o Nicolas.',
      buttonLabel: 'Ver estoque completo',
      link: '/produtos',
      position: 0,
    },
    {
      title: 'Feirao da semana: SUVs com ate R$ 8 mil de desconto',
      subtitle: 'Compass, T-Cross, Creta e Corolla Cross prontos para transferir.',
      buttonLabel: 'Ver SUVs em oferta',
      link: '/produtos?category=suv',
      position: 1,
    },
  ];
  for (const data of bannersData) {
    const exists = await prisma.banner.findFirst({ where: { title: data.title } });
    if (!exists) {
      await prisma.banner.create({
        data: {
          ...data,
          imageDesktop: img(`banner-${data.position}`, 1920, 720),
          imageMobile: img(`banner-m-${data.position}`, 800, 900),
          isActive: true,
        },
      });
    }
  }

  console.log('> Criando depoimentos...');
  const testimonialsData = [
    { customerName: 'Carlos Menezes', role: 'Comprou um Onix LTZ', rating: 5, position: 0, content: 'Comprei meu primeiro carro com o Nicolas. Ele explicou tudo, mostrou o laudo, me ajudou no financiamento e ainda buscou a melhor taxa. Experiencia totalmente diferente de loja grande.' },
    { customerName: 'Fernanda Souza', role: 'Comprou um T-Cross', rating: 5, position: 1, content: 'Dei meu HB20 na troca e sai com o T-Cross no mesmo dia, com documentacao encaminhada. Avaliacao justa do usado e zero pegadinha no contrato.' },
    { customerName: 'Roberto Tavares', role: 'Comprou uma Hilux', rating: 5, position: 2, content: 'Ja e a terceira picape que compro com ele para a fazenda. Carro sempre do jeito que esta no anuncio, quilometragem real e nota na hora.' },
    { customerName: 'Juliana Castro', role: 'Comprou um Argo', rating: 4, position: 3, content: 'Atendimento rapido pelo WhatsApp, agendei o test drive no sabado e fechei na segunda. So demorou um pouco a transferencia por causa do despachante, mas ele resolveu tudo.' },
  ];
  for (const data of testimonialsData) {
    const exists = await prisma.testimonial.findFirst({ where: { customerName: data.customerName } });
    if (!exists) {
      await prisma.testimonial.create({
        data: { ...data, photoUrl: img(`avatar-${data.position}`, 200, 200), isActive: true },
      });
    }
  }

  console.log('> Criando leads de exemplo...');
  const leadsData = [
    { name: 'Marcos Paulo', phone: '(11) 98877-1122', email: 'marcos.paulo@example.com', message: 'O Polo TSI ainda esta disponivel? Consigo test drive no sabado de manha?', status: 'NEW', productSlug: 'volkswagen-polo-tsi-comfortline-2021', daysAgo: 1 },
    { name: 'Ana Beatriz', phone: '(11) 97766-3344', email: null, message: 'Tenho um HB20 2019 quitado. Quanto voce avalia na troca pelo Compass?', status: 'IN_PROGRESS', productSlug: 'jeep-compass-longitude-t270-2022', daysAgo: 2 },
    { name: 'Transportes Silva ME', phone: '(11) 3222-9090', email: 'compras@transportessilva.com.br', message: 'Preciso de 2 Stradas para a frota. Fecha um valor para as duas?', status: 'PROPOSAL_SENT', productSlug: 'fiat-strada-endurance-2022', daysAgo: 4 },
    { name: 'Renata Lima', phone: '(11) 96655-7788', email: 'renata.lima@example.com', message: 'Qual a melhor condicao a vista para o Corolla XEi?', status: 'CONVERTED', productSlug: 'toyota-corolla-xei-2021', daysAgo: 7 },
    { name: 'Pedro Henrique', phone: '(11) 95544-2211', email: null, message: 'O Civic aceita financiamento com entrada de 20 mil?', status: 'LOST', productSlug: 'honda-civic-exl-2020', daysAgo: 10 },
  ];
  for (const data of leadsData) {
    const exists = await prisma.lead.findFirst({ where: { name: data.name } });
    if (exists) continue;
    const product = productIds.find((entry) => entry.slug === data.productSlug);
    const createdAt = new Date(Date.now() - data.daysAgo * 24 * 60 * 60 * 1000);
    const lead = await prisma.lead.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        message: data.message,
        status: data.status as any,
        source: 'PRODUCT_INTEREST',
        productId: product?.id ?? null,
        createdAt,
      },
    });
    await prisma.leadHistory.create({
      data: { leadId: lead.id, toStatus: lead.status, note: 'Contato recebido pelo site', createdAt },
    });
  }

  console.log('> Gerando historico de metricas (60 dias)...');
  const existingEvents = await prisma.analyticsEvent.count();
  if (existingEvents === 0) {
    const devices: DeviceType[] = [DeviceType.MOBILE, DeviceType.MOBILE, DeviceType.MOBILE, DeviceType.DESKTOP, DeviceType.DESKTOP, DeviceType.TABLET];
    const referrers = [null, null, null, 'https://www.google.com/', 'https://www.google.com/', 'https://www.instagram.com/', 'https://www.facebook.com/', 'https://wa.me/'];
    const searchTerms = ['polo', 'onix', 'corolla', 'suv automatico', 'hilux diesel', 'carro ate 60 mil', 'compass', 'picape', 'civic', 'automatico'];
    const noResultTerms = ['moto honda', 'caminhao', 'gol quadrado'];

    let stateSeed = 42;
    const rand = () => {
      stateSeed = (stateSeed * 1664525 + 1013904223) % 4294967296;
      return stateSeed / 4294967296;
    };
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

    const events: any[] = [];
    const now = Date.now();

    for (let day = 59; day >= 0; day--) {
      const date = new Date(now - day * 24 * 60 * 60 * 1000);
      const weekday = date.getDay();
      const weekFactor = weekday === 0 ? 0.5 : weekday === 6 ? 0.9 : 1;
      const growth = 1 + (59 - day) / 80;
      const dailyViews = Math.round((8 + rand() * 14) * weekFactor * growth);

      for (let i = 0; i < dailyViews; i++) {
        const product = pick(productIds);
        const timestamp = new Date(date.getTime() - rand() * 12 * 60 * 60 * 1000);
        const anonymousId = `anon-${Math.floor(rand() * 400)}`;
        const referrer = pick(referrers);

        events.push({
          type: AnalyticsEventType.PRODUCT_VIEW,
          productId: product.id,
          device: pick(devices),
          referrer,
          referrerHost: referrer ? new URL(referrer).hostname.replace(/^www\./, '') : null,
          anonymousId,
          sessionId: `sess-${anonymousId}-${day}`,
          path: `/produto/${product.slug}`,
          createdAt: timestamp,
        });

        if (rand() < 0.14) {
          events.push({
            type: AnalyticsEventType.WHATSAPP_CLICK,
            productId: product.id,
            device: pick(devices),
            anonymousId,
            sessionId: `sess-${anonymousId}-${day}`,
            path: `/produto/${product.slug}`,
            createdAt: new Date(timestamp.getTime() + 90_000),
          });
        }
        if (rand() < 0.05) {
          events.push({
            type: AnalyticsEventType.SHARE_CLICK,
            productId: product.id,
            device: pick(devices),
            anonymousId,
            path: `/produto/${product.slug}`,
            createdAt: new Date(timestamp.getTime() + 120_000),
          });
        }
      }

      const dailyCategoryViews = Math.round(dailyViews * 0.45);
      for (let i = 0; i < dailyCategoryViews; i++) {
        const entry = pick(productIds);
        events.push({
          type: AnalyticsEventType.CATEGORY_VIEW,
          categoryId: entry.catId,
          device: pick(devices),
          anonymousId: `anon-${Math.floor(rand() * 400)}`,
          createdAt: new Date(date.getTime() - rand() * 12 * 60 * 60 * 1000),
        });
      }

      const dailySearches = Math.round(2 + rand() * 5 * weekFactor);
      for (let i = 0; i < dailySearches; i++) {
        const noResult = rand() < 0.18;
        events.push({
          type: noResult ? AnalyticsEventType.SEARCH_NO_RESULT : AnalyticsEventType.SEARCH,
          searchTerm: noResult ? pick(noResultTerms) : pick(searchTerms),
          resultCount: noResult ? 0 : Math.floor(1 + rand() * 6),
          device: pick(devices),
          anonymousId: `anon-${Math.floor(rand() * 400)}`,
          createdAt: new Date(date.getTime() - rand() * 12 * 60 * 60 * 1000),
        });
      }
    }

    await prisma.analyticsEvent.createMany({ data: events });

    await prisma.$executeRaw`
      UPDATE products p SET
        "viewCount" = COALESCE(s.views, 0),
        "whatsappClickCount" = COALESCE(s.clicks, 0),
        "shareCount" = COALESCE(s.shares, 0)
      FROM (
        SELECT "productId",
          COUNT(*) FILTER (WHERE type = 'PRODUCT_VIEW') AS views,
          COUNT(*) FILTER (WHERE type = 'WHATSAPP_CLICK') AS clicks,
          COUNT(*) FILTER (WHERE type = 'SHARE_CLICK') AS shares
        FROM analytics_events WHERE "productId" IS NOT NULL GROUP BY "productId"
      ) s WHERE p.id = s."productId"
    `;
    await prisma.$executeRaw`
      UPDATE categories c SET "viewCount" = COALESCE(s.views, 0)
      FROM (
        SELECT "categoryId", COUNT(*) AS views
        FROM analytics_events WHERE "categoryId" IS NOT NULL AND type = 'CATEGORY_VIEW'
        GROUP BY "categoryId"
      ) s WHERE c.id = s."categoryId"
    `;
    console.log(`  ${events.length} eventos criados.`);
  } else {
    console.log('  Eventos ja existem, pulando.');
  }

  console.log('\nSeed concluido!');
  console.log(`  Painel: /admin`);
  console.log(`  E-mail: ${ADMIN_EMAIL}`);
  console.log(`  Senha:  ${ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
