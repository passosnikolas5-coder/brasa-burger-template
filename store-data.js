window.BRASA_DATA = {
  "store": {
    "name": "Brasa Burger",
    "demo": true,
    "whatsapp": "",
    "email": "",
    "timezone": "America/Sao_Paulo",
    "address": {
      "street": "Rua das Brasas",
      "number": "128",
      "neighborhood": "Centro",
      "city": "Cidade Exemplo",
      "state": "SP",
      "cep": "00000-000"
    },
    "hours": [
      {
        "days": "Terça a domingo",
        "time": "18h às 23h30"
      },
      {
        "days": "Segunda-feira",
        "time": "Fechado"
      }
    ],
    "pickupEstimate": "20–30 min",
    "delivery": {
      "feeCents": 600,
      "minSubtotalCents": 2000,
      "estimate": "35–55 min",
      "neighborhoods": [
        "Centro",
        "Vila Nova",
        "Jardim"
      ],
      "zones": [
        {
          "id": "centro",
          "neighborhood": "Centro",
          "cepStart": "00000001",
          "cepEnd": "00000099",
          "feeCents": 600,
          "estimate": "25–35 min"
        },
        {
          "id": "vila-nova",
          "neighborhood": "Vila Nova",
          "cepStart": "00000100",
          "cepEnd": "00000199",
          "feeCents": 800,
          "estimate": "35–45 min"
        },
        {
          "id": "jardim",
          "neighborhood": "Jardim",
          "cepStart": "00000200",
          "cepEnd": "00000299",
          "feeCents": 1000,
          "estimate": "40–50 min"
        }
      ]
    },
    "coupon": {
      "code": "BRASA10",
      "percent": 10,
      "minSubtotalCents": 5000,
      "maxDiscountCents": 1500
    },
    "payments": [
      "pix",
      "card",
      "cash"
    ],
    "loyalty": {
      "ordersForReward": 5,
      "rewardCents": 1290
    }
  },
  "products": [
    {
      "id": "brasa-classico",
      "name": "Brasa Clássico",
      "category": "bovino",
      "categoryLabel": "Carne",
      "price": 2990,
      "description": "Pão brioche, burger bovino de 160 g, cheddar, alface, tomate e molho da casa.",
      "ingredients": [
        "Pão brioche",
        "Burger bovino · 160 g",
        "Cheddar",
        "Alface",
        "Tomate",
        "Molho da casa"
      ],
      "removable": [
        "Alface",
        "Tomate",
        "Molho da casa"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon",
        "patty"
      ],
      "photo": {
        "src": "assets/products/brasa-classico-1254.webp",
        "smallSrc": "assets/products/brasa-classico-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "O original"
    },
    {
      "id": "smash-duplo",
      "name": "Smash Duplo",
      "category": "bovino",
      "categoryLabel": "Carne",
      "price": 3490,
      "description": "Dois smash de 80 g, cheddar, cebola na chapa, picles e molho da casa no brioche.",
      "ingredients": [
        "Pão brioche",
        "Dois smash · 80 g cada",
        "Cheddar",
        "Cebola",
        "Picles",
        "Molho da casa"
      ],
      "removable": [
        "Cebola",
        "Picles",
        "Molho da casa"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon",
        "patty"
      ],
      "photo": {
        "src": "assets/products/smash-duplo-1254.webp",
        "smallSrc": "assets/products/smash-duplo-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Dobro de sabor"
    },
    {
      "id": "bacon-brasa",
      "name": "Brasa Completo",
      "category": "bovino",
      "categoryLabel": "Carne",
      "price": 3990,
      "description": "Burger de 180 g, bacon, cheddar, alface, tomate, picles e molho da casa no brioche.",
      "ingredients": [
        "Pão brioche",
        "Burger bovino · 180 g",
        "Bacon",
        "Cheddar",
        "Alface",
        "Tomate",
        "Picles",
        "Molho da casa"
      ],
      "removable": [
        "Bacon",
        "Alface",
        "Tomate",
        "Picles",
        "Molho da casa"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon",
        "patty"
      ],
      "photo": {
        "src": "assets/products/bacon-brasa-1254.webp",
        "smallSrc": "assets/products/bacon-brasa-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Cada camada conta"
    },
    {
      "id": "frango-crocante",
      "name": "Frango Crocante",
      "category": "frango",
      "categoryLabel": "Frango",
      "price": 3290,
      "description": "Filé de frango empanado e salada cremosa de repolho no pão brioche.",
      "ingredients": [
        "Pão brioche",
        "Filé de frango empanado",
        "Salada de repolho",
        "Molho cremoso"
      ],
      "removable": [
        "Salada de repolho",
        "Molho cremoso"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon"
      ],
      "photo": {
        "src": "assets/products/frango-crocante-1254.webp",
        "smallSrc": "assets/products/frango-crocante-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Por fora, crocante"
    },
    {
      "id": "jardim-veggie",
      "name": "Jardim Veggie",
      "category": "vegetariano",
      "categoryLabel": "Vegetariano",
      "price": 3190,
      "description": "Burger de grão-de-bico, repolho roxo, folhas verdes e maionese de ervas.",
      "ingredients": [
        "Pão",
        "Burger de grão-de-bico",
        "Repolho roxo",
        "Folhas verdes",
        "Maionese de ervas"
      ],
      "removable": [
        "Repolho roxo",
        "Folhas verdes",
        "Maionese de ervas"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar"
      ],
      "photo": {
        "src": "assets/products/jardim-veggie-1254.webp",
        "smallSrc": "assets/products/jardim-veggie-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Vegetariano"
    },
    {
      "id": "bbq",
      "name": "Brasa BBQ",
      "category": "bovino",
      "categoryLabel": "Carne",
      "price": 4690,
      "description": "Burger de 180 g, cheddar, onion rings e barbecue no brioche.",
      "ingredients": [
        "Pão brioche",
        "Burger bovino · 180 g",
        "Cheddar",
        "Onion rings",
        "Barbecue"
      ],
      "removable": [
        "Onion rings",
        "Barbecue"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon",
        "patty"
      ],
      "photo": {
        "src": "assets/products/bbq-1254.webp",
        "smallSrc": "assets/products/bbq-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Para a grande fome"
    },
    {
      "id": "combo-classico",
      "name": "Combo Clássico",
      "category": "combo",
      "categoryLabel": "Combo",
      "price": 4490,
      "description": "Brasa Clássico, batata frita de 120 g e refrigerante de cola de 350 ml.",
      "ingredients": [
        "Brasa Clássico",
        "Batata frita · 120 g",
        "Refrigerante de cola · 350 ml",
        "Alface",
        "Tomate",
        "Molho da casa"
      ],
      "removable": [
        "Alface",
        "Tomate",
        "Molho da casa"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon",
        "patty"
      ],
      "photo": {
        "src": "assets/products/combo-classico-1254.webp",
        "smallSrc": "assets/products/combo-classico-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Burger + fritas + bebida"
    },
    {
      "id": "combo-smash",
      "name": "Combo Smash",
      "category": "combo",
      "categoryLabel": "Combo",
      "price": 4990,
      "description": "Smash Duplo, batata frita de 120 g e refrigerante de cola de 350 ml.",
      "ingredients": [
        "Smash Duplo",
        "Batata frita · 120 g",
        "Refrigerante de cola · 350 ml",
        "Cebola",
        "Picles",
        "Molho da casa"
      ],
      "removable": [
        "Cebola",
        "Picles",
        "Molho da casa"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon",
        "patty"
      ],
      "photo": {
        "src": "assets/products/combo-smash-1254.webp",
        "smallSrc": "assets/products/combo-smash-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Uma refeição completa"
    },
    {
      "id": "batata",
      "name": "Batata Frita",
      "category": "acompanhamento",
      "categoryLabel": "Porção",
      "price": 1290,
      "description": "Porção de 150 g de batatas douradas, com sal e molho da casa à parte.",
      "ingredients": [
        "Batata",
        "Sal",
        "Molho da casa à parte"
      ],
      "removable": [
        "Sal",
        "Molho da casa à parte"
      ],
      "allergens": [
        "Ovos"
      ],
      "extras": [
        "cheddar",
        "bacon"
      ],
      "photo": {
        "src": "assets/products/batata-1254.webp",
        "smallSrc": "assets/products/batata-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Para acompanhar"
    },
    {
      "id": "onion-rings",
      "name": "Onion Rings",
      "category": "acompanhamento",
      "categoryLabel": "Porção",
      "price": 1590,
      "description": "Porção de 150 g de anéis de cebola empanados, com molho barbecue à parte.",
      "ingredients": [
        "Cebola",
        "Empanamento",
        "Barbecue à parte"
      ],
      "removable": [
        "Barbecue à parte"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos"
      ],
      "extras": [],
      "photo": {
        "src": "assets/products/onion-rings-1254.webp",
        "smallSrc": "assets/products/onion-rings-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Dourados e crocantes"
    },
    {
      "id": "limonada",
      "name": "Limonada Natural",
      "category": "bebida",
      "categoryLabel": "Bebida",
      "price": 1190,
      "description": "Limonada de 400 ml com gelo. Escolha retirar o açúcar na personalização.",
      "ingredients": [
        "Limão",
        "Água",
        "Açúcar",
        "Gelo"
      ],
      "removable": [
        "Açúcar",
        "Gelo"
      ],
      "allergens": [],
      "extras": [],
      "photo": {
        "src": "assets/products/limonada-1254.webp",
        "smallSrc": "assets/products/limonada-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Para refrescar"
    },
    {
      "id": "milkshake",
      "name": "Milkshake de Chocolate",
      "category": "bebida",
      "categoryLabel": "Bebida",
      "price": 1890,
      "description": "Milkshake de 400 ml com sorvete, calda de chocolate e chantilly.",
      "ingredients": [
        "Sorvete de chocolate",
        "Leite",
        "Calda de chocolate",
        "Chantilly"
      ],
      "removable": [
        "Chantilly"
      ],
      "allergens": [
        "Leite",
        "Soja"
      ],
      "extras": [],
      "photo": {
        "src": "assets/products/milkshake-1254.webp",
        "smallSrc": "assets/products/milkshake-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Cremoso até o fim"
    },
    {
      "id": "brownie",
      "name": "Brownie com Sorvete",
      "category": "sobremesa",
      "categoryLabel": "Sobremesa",
      "price": 1690,
      "description": "Brownie de chocolate de 80 g, uma bola de sorvete de baunilha e calda de chocolate.",
      "ingredients": [
        "Brownie de chocolate",
        "Sorvete de baunilha",
        "Calda de chocolate"
      ],
      "removable": [
        "Sorvete de baunilha",
        "Calda de chocolate"
      ],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos",
        "Soja"
      ],
      "extras": [],
      "photo": {
        "src": "assets/products/brownie-1254.webp",
        "smallSrc": "assets/products/brownie-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Uma pausa doce"
    },
    {
      "id": "cookie",
      "name": "Cookie de Chocolate",
      "category": "sobremesa",
      "categoryLabel": "Sobremesa",
      "price": 990,
      "description": "Cookie de 80 g com pedaços de chocolate e borda dourada.",
      "ingredients": [
        "Massa de cookie",
        "Chocolate"
      ],
      "removable": [],
      "allergens": [
        "Trigo",
        "Leite",
        "Ovos",
        "Soja"
      ],
      "extras": [],
      "photo": {
        "src": "assets/products/cookie-1254.webp",
        "smallSrc": "assets/products/cookie-640.webp",
        "width": 1254,
        "height": 1254,
        "columns": 1,
        "rows": 1,
        "col": 0,
        "row": 0
      },
      "tag": "Para fechar o pedido"
    }
  ],
  "extras": [
    {
      "id": "cheddar",
      "name": "Cheddar extra",
      "price": 400
    },
    {
      "id": "bacon",
      "name": "Bacon crocante",
      "price": 600
    },
    {
      "id": "patty",
      "name": "Burger bovino extra · 160 g",
      "price": 1000
    }
  ],
  "bundles": [
    {
      "id": "refeicao",
      "name": "Transformar em combo",
      "sideIds": [
        "batata",
        "onion-rings"
      ],
      "drinkIds": [
        "limonada",
        "milkshake"
      ],
      "discountCents": 490,
      "categories": [
        "bovino",
        "frango",
        "vegetariano"
      ]
    }
  ]
};
