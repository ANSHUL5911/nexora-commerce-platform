'use strict';

/**
 * Seeder 02: Products Seed
 * Curated luxury editorial catalog items with integer paise prices.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const products = [
      {
        id: 'd0000000-0000-4000-8000-000000000001',
        name: 'Monolith Architectural Coat',
        description: 'Structured wool-blend oversized coat tailored with sharp peak lapels and horn buttons.',
        price_paise: 1899900, // ₹18,999.00
        stock_quantity: 1, // Single unit for deterministic race-condition tests
        reserved_quantity: 0,
        category: 'Outerwear',
        image_url: 'https://images.unsplash.com/photo-1539533018447-63fcce667883?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000002',
        name: 'Minimalist Silk Evening Shirt',
        description: 'Raw mulberry silk draped silhouette with concealed placket and French cuffs.',
        price_paise: 849900, // ₹8,499.00
        stock_quantity: 15,
        reserved_quantity: 0,
        category: 'Apparel',
        image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000003',
        name: 'Brutalist Concrete Chronograph',
        description: 'Matte titanium case with raw stone composite dial and Swiss quartz movement.',
        price_paise: 2499900, // ₹24,999.00
        stock_quantity: 8,
        reserved_quantity: 0,
        category: 'Timepieces',
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000004',
        name: 'Sculpted Vachetta Leather Tote',
        description: 'Vegetable-tanned full-grain leather tote with hand-stitched rolled handles and brass hardware.',
        price_paise: 1450000, // ₹14,500.00
        stock_quantity: 10,
        reserved_quantity: 0,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000005',
        name: 'Pleated Wide-Leg Wool Trousers',
        description: 'High-waisted Italian tropical wool trousers with deep double reverse pleats.',
        price_paise: 920000, // ₹9,200.00
        stock_quantity: 20,
        reserved_quantity: 0,
        category: 'Apparel',
        image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000006',
        name: 'Derby Oxford Handcrafted Shoes',
        description: 'Goodyear-welted calfskin derby shoes with stacked leather heels and blind eyelets.',
        price_paise: 1699900, // ₹16,999.00
        stock_quantity: 12,
        reserved_quantity: 0,
        category: 'Footwear',
        image_url: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000007',
        name: 'Artisanal Ceramic Vessel',
        description: 'Hand-thrown stoneware vessel finished in a tactile volcanic ash glaze.',
        price_paise: 420000, // ₹4,200.00
        stock_quantity: 18,
        reserved_quantity: 0,
        category: 'Living',
        image_url: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000008',
        name: 'Cashmere Ribbed Knit Beanie',
        description: 'Heavyweight Grade-A Mongolian cashmere beanie with subtle architectural fold.',
        price_paise: 380000, // ₹3,800.00
        stock_quantity: 25,
        reserved_quantity: 0,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000009',
        name: 'Monochromatic Suede Loafer',
        description: 'Unlined Italian reverse suede loafer with flexible Blake-stitched leather sole.',
        price_paise: 1350000, // ₹13,500.00
        stock_quantity: 14,
        reserved_quantity: 0,
        category: 'Footwear',
        image_url: 'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000010',
        name: 'Solid Brass Geometric Incense Burner',
        description: 'Precision milled solid untreated brass burner that patinas naturally over time.',
        price_paise: 540000, // ₹5,400.00
        stock_quantity: 30,
        reserved_quantity: 0,
        category: 'Living',
        image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000011',
        name: 'Linen Canvas Utility Overshirt',
        description: 'Heavyweight Normandy linen field shirt with dual bellows pockets and horn buttons.',
        price_paise: 790000, // ₹7,900.00
        stock_quantity: 16,
        reserved_quantity: 0,
        category: 'Apparel',
        image_url: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'd0000000-0000-4000-8000-000000000012',
        name: 'Polarized Titanium Aviator Sunglasses',
        description: 'Japanese beta-titanium wireframe sunglasses with anti-reflective mineral glass lenses.',
        price_paise: 1199900, // ₹11,999.00
        stock_quantity: 10,
        reserved_quantity: 0,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
        is_deleted: false,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    await queryInterface.bulkInsert('products', products, {});
  },

  async down(queryInterface, Sequelize) {
    const ids = Array.from({ length: 12 }, (_, i) => `d0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    await queryInterface.bulkDelete('products', { id: ids });
  },
};
