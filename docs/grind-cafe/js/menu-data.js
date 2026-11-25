/**
 * Official food menu transcribed from The Grind Cafe's printed menu images
 * posted at https://www.grindcafenc.com/menu (labeled "as of 6/1/24").
 *
 * Do not invent or "correct" names or prices here. Spellings such as
 * "Rueben" and "vinegarette" match the printed menu.
 *
 * Coffee, smoothie, and ice cream items live in GRIND_DRINKS_SAMPLE
 * because printed menu page 2 is not posted on the official site.
 */
window.GRIND_MENU_META = {
  source: "Official printed menu images at grindcafenc.com/menu, dated June 1, 2024.",
  singleplatform: "http://places.singleplatform.com/the-grind-cafe-3/menu?ref=google did not publish item prices.",
  drinksNote: "Printed menu page 2 (coffee, smoothies, and ice cream) is not posted on grindcafenc.com, so that section is sample content for the owner to fill in."
};

window.GRIND_MENU = {
  breakfast: [
    {
      id: "breakfast-burrito",
      name: "Breakfast Burrito",
      description: "Chorizo, fresh eggs, muenster cheese, green pepper, tomatoes and red onion rolled in a warm tortilla. Served with fresh salsa and sour cream.",
      price: 11.00
    },
    {
      id: "lox-bagel",
      name: "Lox Bagel",
      description: "Smoked salmon, cream cheese, capers, thinly sliced red onion and cucumbers on a toasted everything bagel.",
      price: 13.50
    },
    {
      id: "breakfast-tacos",
      name: "Breakfast Tacos",
      description: "Chorizo, fresh eggs, tomatoes, green pepper, onion and chipotle mayo on toasted cheese tortillas.",
      price: 12.00
    },
    {
      id: "breakfast-quiche",
      name: "Breakfast Quiche",
      description: "Fresh eggs, potatoes, ham, green peppers, onion, mushrooms, swiss and muenster cheese baked into a perfect quiche. Served with toast.",
      price: 10.00
    },
    {
      id: "hot-ham-cheese",
      name: "Hot Ham & Cheese",
      description: "Ham and swiss cheese on a toasted bagel. Add an egg for $1.00.",
      price: 8.00,
      addEgg: true
    },
    {
      id: "toasted-bagel",
      name: "Toasted Bagel",
      description: "Everything, asiago, blueberry or plain bagel with butter or cream cheese.",
      price: 5.00,
      options: ["Everything", "Asiago", "Blueberry", "Plain"],
      optionLabel: "Bagel"
    },
    {
      id: "french-toast-casserole",
      name: "French Toast Casserole",
      description: "Seasonal french toast casserole served with bacon.",
      price: 12.00
    },
    {
      id: "parfait",
      name: "Parfait",
      description: "Organic yogurt, fresh seasonal fruit & granola.",
      price: 8.00
    },
    {
      id: "granola-bowl",
      name: "Granola Bowl",
      description: "Granola with your choice of milk.",
      price: 6.00
    }
  ],
  buildYourOwn: {
    id: "build-your-own",
    name: "Build Your Own",
    description: "Choose a bread or bagel, a protein, and a cheese. Add an egg for $1.00.",
    price: 8.00,
    breads: ["Ciabatta", "Sourdough", "Whole wheat", "Kaiser", "Everything bagel", "Blueberry bagel", "Asiago bagel", "Plain bagel"],
    proteins: ["Bacon", "Chorizo", "Ham", "Turkey", "Cranberry turkey salad"],
    cheeses: ["Cheddar", "Pepperjack", "Provolone", "Swiss", "Muenster"],
    addEggPrice: 1.00
  },
  lunch: [
    {
      id: "burke-turkey-jack",
      name: "Burke Turkey Jack",
      description: "Grilled turkey, roasted mushrooms, caramelized onions, roasted red peppers, pepperjack and mayo on a toasted kaiser.",
      price: 12.00
    },
    {
      id: "kickin-grinder",
      name: "Kickin Grinder",
      description: "Ham, turkey, bacon, spring mix, cheddar, tomatoes, mayo & mustard on a toasted hoagie.",
      price: 12.00
    },
    {
      id: "remarkable-rueben",
      name: "Remarkable Rueben",
      description: "Grilled pastrami, kraut, swiss cheese, 1000 island & mustard on toasted rye.",
      price: 13.00
    },
    {
      id: "pig-in-the-grass",
      name: "Pig in the Grass",
      description: "Ham, swiss, spinach, bacon and honey mustard on toasted sourdough.",
      price: 12.00
    },
    {
      id: "pimento-blt",
      name: "Pimento BLT",
      description: "House-made pimento cheese, tomato, spring mix, bacon & chipotle mayo on toasted sourdough.",
      price: 11.00
    },
    {
      id: "union-street",
      name: "Union Street",
      description: "Turkey, swiss, cucumbers & ranch on toasted whole wheat.",
      price: 11.00
    },
    {
      id: "roast-beef-royale",
      name: "Roast Beef Royale",
      description: "Roast beef, swiss, horseradish mayo, red onion & spring mix on toasted rye.",
      price: 12.00
    },
    {
      id: "cranberry-turkey-salad",
      name: "Cranberry Turkey Salad",
      description: "Cranberry turkey salad, chipotle mayo, spring mix & tomato on toasted whole wheat.",
      price: 12.00
    },
    {
      id: "mountain-hog",
      name: "Mountain Hog",
      description: "Cubano! Roasted pork, ham, swiss, pickles & our housemade cubano sauce on a pressed hoagie.",
      price: 13.00
    }
  ],
  vegetarian: [
    {
      id: "apollo-wrap",
      name: "Apollo Wrap",
      description: "Spring mix, cucumber, green pepper, black olives, feta & balsamic in a spinach herb wrap.",
      price: 11.00
    },
    {
      id: "king-street-party",
      name: "King Street Party",
      description: "Spring mix, tomato, cucumber, carrot, green pepper, onion, provolone & choice of dressing. Add ham, turkey or turkey salad for $2.",
      price: 11.00,
      addProtein: true,
      addProteinPrice: 2.00,
      addProteinOptions: ["Ham", "Turkey", "Turkey salad"]
    },
    {
      id: "grilled-cheese",
      name: "Grilled Cheese",
      description: "Cheddar & provolone on toasted sourdough.",
      price: 7.00
    }
  ],
  sides: [
    {
      id: "side-salad",
      name: "Side salad",
      description: "A side salad with your choice of house dressing.",
      price: 2.50
    },
    {
      id: "seasonal-side",
      name: "Rotating seasonal side",
      description: "Changes with the season. Ask at the counter for today's side.",
      price: 2.00
    }
  ],
  chipsNote: "Chips (regular, salt and vinegar, or BBQ) are listed as a side on the printed menu, with no price. Confirm with the shop before charging for them.",
  dressings: ["Ranch", "Honey mustard", "Balsamic vinegarette", "1000 island"]
};

/**
 * SAMPLE CONTENT. Official drink prices were not available from
 * grindcafenc.com or SinglePlatform. The owner should replace these.
 */
window.GRIND_DRINKS_SAMPLE = {
  sample: true,
  note: "Sample content for the demo. The official coffee, smoothie, and ice cream menu (printed page 2) is not posted on grindcafenc.com. Replace these items and prices before a live launch.",
  items: [
    { id: "sample-drip", name: "Drip coffee", description: "Sample item — owner to fill in size and price.", price: 3.00, sample: true },
    { id: "sample-latte", name: "Latte", description: "Sample item — owner to fill in size and price.", price: 4.50, sample: true },
    { id: "sample-cappuccino", name: "Cappuccino", description: "Sample item — owner to fill in size and price.", price: 4.50, sample: true },
    { id: "sample-mocha", name: "Mocha", description: "Sample item — owner to fill in size and price.", price: 5.00, sample: true },
    { id: "sample-cold-brew", name: "Cold brew", description: "Sample item — owner to fill in size and price.", price: 4.50, sample: true },
    { id: "sample-chai", name: "Chai latte", description: "Sample item — owner to fill in size and price.", price: 4.50, sample: true },
    { id: "sample-smoothie", name: "Smoothie", description: "Sample item — owner to fill in flavors and price.", price: 6.50, sample: true },
    { id: "sample-scoop", name: "Ice cream scoop", description: "Sample item — owner to fill in flavors and price.", price: 4.00, sample: true }
  ]
};
