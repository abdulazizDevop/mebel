export interface ColorVariant {
  hex: string;
  image: string;
  name?: string;
  photos?: string[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  purchasePrice?: number;
  image: string;
  category: string;
  description: string;
  dimensions?: string;
  weight?: string;
  material?: string;
  color?: 'terracotta' | 'mustard' | 'primary';
  colorVariants: ColorVariant[];
  inStock?: boolean;
  quantity?: number;
}

export const categories = [
  'Все',
  'Тумбочки',
  'Шкафы распашные',
  'Комоды',
  'Кровати',
  'Консоли',
  'Гладилки',
  'Обувницы',
  'ТВ тумбы',
  'Прихожки',
  'Садовые столы',
  'Детские шкафчики',
  'Письменные столы',
  'Индивидуальные заказы',
];

export const products: Product[] = [
  {
    id: '1',
    name: 'Тумба прикроватная Oslo',
    sku: 'RM01045',
    price: 8900,
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800',
    category: 'Тумбочки',
    description: 'Компактная прикроватная тумба с двумя ящиками. Скандинавский стиль с мягкими формами и натуральными материалами.',
    dimensions: '45 × 40 × 55 см',
    weight: '12 кг',
    material: 'Массив берёзы, МДФ',
    color: 'mustard',
    colorVariants: [
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '2',
    name: 'Шкаф распашной Marta',
    sku: 'RM02018',
    price: 34500,
    image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=800',
    category: 'Шкафы распашные',
    description: 'Двухдверный распашной шкаф с полками и штангой для одежды. Просторный и функциональный.',
    dimensions: '120 × 60 × 200 см',
    weight: '68 кг',
    material: 'ЛДСП, фурнитура Hettich',
    color: 'primary',
    colorVariants: [
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '3',
    name: 'Комод Berlin',
    sku: 'RM03092',
    price: 19800,
    image: 'https://images.unsplash.com/photo-1556020685-ae41abfc9365?auto=format&fit=crop&q=80&w=800',
    category: 'Комоды',
    description: 'Вместительный комод с 4 ящиками на доводчиках. Лаконичный дизайн для спальни или гостиной.',
    dimensions: '100 × 45 × 85 см',
    weight: '35 кг',
    material: 'МДФ, шпон дуба',
    color: 'mustard',
    colorVariants: [
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1556020685-ae41abfc9365?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '4',
    name: 'Кровать Nordic',
    sku: 'RM04037',
    price: 42000,
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800',
    category: 'Кровати',
    description: 'Двуспальная кровать с мягким изголовьем. Ортопедическое основание в комплекте. Тихий, уютный дизайн.',
    dimensions: '180 × 200 × 110 см',
    weight: '55 кг',
    material: 'Массив сосны, велюр',
    color: 'terracotta',
    colorVariants: [
      { hex: '#8E392B', image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '5',
    name: 'Консоль Verona',
    sku: 'RM05061',
    price: 15400,
    image: 'https://images.unsplash.com/photo-1532372576444-dda954194ad0?auto=format&fit=crop&q=80&w=800',
    category: 'Консоли',
    description: 'Узкая консоль для прихожей или гостиной. Элегантные металлические ножки и деревянная столешница.',
    dimensions: '110 × 35 × 80 см',
    weight: '14 кг',
    material: 'Массив дуба, металл',
    color: 'mustard',
    colorVariants: [
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1532372576444-dda954194ad0?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1611967164521-abae8fba4668?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '6',
    name: 'Гладильная доска Comfort',
    sku: 'RM06014',
    price: 6500,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&q=80&w=800',
    category: 'Гладилки',
    description: 'Встраиваемая гладильная доска-трансформер. Компактно складывается в шкаф или нишу.',
    dimensions: '120 × 38 × 90 см',
    weight: '8 кг',
    material: 'Сталь, хлопковый чехол',
    color: 'primary',
    colorVariants: [
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '7',
    name: 'Обувница Slim',
    sku: 'RM07023',
    price: 11200,
    image: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&q=80&w=800',
    category: 'Обувницы',
    description: 'Узкая обувница с откидными секциями на 12 пар. Идеальна для небольших прихожих.',
    dimensions: '60 × 20 × 120 см',
    weight: '18 кг',
    material: 'ЛДСП, металлическая фурнитура',
    color: 'primary',
    colorVariants: [
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&q=80&w=800' },
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1556020685-ae41abfc9365?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '8',
    name: 'ТВ тумба Horizon',
    sku: 'RM08041',
    price: 16900,
    image: 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?auto=format&fit=crop&q=80&w=800',
    category: 'ТВ тумбы',
    description: 'Низкая ТВ тумба с открытыми полками и закрытыми секциями. Кабель-менеджмент встроен.',
    dimensions: '180 × 40 × 45 см',
    weight: '28 кг',
    material: 'МДФ, шпон ореха',
    color: 'mustard',
    colorVariants: [
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '9',
    name: 'Прихожая Milano',
    sku: 'RM09055',
    price: 22500,
    image: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&q=80&w=800',
    category: 'Прихожки',
    description: 'Компактная прихожая с вешалкой, зеркалом и обувницей. Всё необходимое в одном модуле.',
    dimensions: '150 × 35 × 200 см',
    weight: '42 кг',
    material: 'ЛДСП, зеркало, крючки металл',
    color: 'terracotta',
    colorVariants: [
      { hex: '#8E392B', image: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '10',
    name: 'Садовый стол Provence',
    sku: 'RM10072',
    price: 28000,
    image: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&q=80&w=800',
    category: 'Садовые столы',
    description: 'Большой садовый стол из массива акации. Устойчив к влаге и перепадам температуры.',
    dimensions: '180 × 90 × 75 см',
    weight: '32 кг',
    material: 'Массив акации, лак',
    color: 'mustard',
    colorVariants: [
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1611967164521-abae8fba4668?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '11',
    name: 'Детский шкафчик Bunny',
    sku: 'RM11088',
    price: 14500,
    image: 'https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&q=80&w=800',
    category: 'Детские шкафчики',
    description: 'Яркий и безопасный шкафчик для детской комнаты. Скруглённые углы, доводчики на дверцах.',
    dimensions: '80 × 50 × 140 см',
    weight: '30 кг',
    material: 'МДФ, экокраска',
    color: 'primary',
    colorVariants: [
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&q=80&w=800' },
      { hex: '#8E392B', image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800' },
    ]
  },
  {
    id: '12',
    name: 'Письменный стол Studio',
    sku: 'RM12096',
    price: 18700,
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=800',
    category: 'Письменные столы',
    description: 'Эргономичный письменный стол с выдвижным ящиком и кабель-органайзером. Для работы и учёбы.',
    dimensions: '120 × 60 × 75 см',
    weight: '22 кг',
    material: 'Массив бука, металл',
    color: 'mustard',
    colorVariants: [
      { hex: '#D18D3D', image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=800' },
      { hex: '#2D2D2D', image: 'https://images.unsplash.com/photo-1611967164521-abae8fba4668?auto=format&fit=crop&q=80&w=800' },
      { hex: '#E8DDD0', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800' },
    ]
  },
];
