/**
 * Every kind of item that can be carried, in one place: its name, what Use does with it (eat, throw or release), its
 * size and colour (for the small model that flies to you, is thrown or drifts away) and its line icon (24 x 24, drawn
 * like the other buttons' icons). Adding a kind: one entry here, then a source in app/items.js. cook: what it becomes
 * roasted on a stick at a firepit or the fireplace (app/cooking.js); a food without it cannot be cooked. hint: what Use
 * says for a kind that is not used on its own.
 */
export const KINDS = {
  apple: { name: 'Apple', use: 'eat', cook: 'bakedApple', r: 0.04, color: 0xb8322a, icon: '<path d="M12 7.5c-2.2-2-6.5-1.4-6.5 3.6 0 4.2 2.6 8.4 4.6 8.4.8 0 1.1-.5 1.9-.5s1.1.5 1.9.5c2 0 4.6-4.2 4.6-8.4 0-5-4.3-5.6-6.5-3.6z"/><path d="M12 7.5c0-2 .8-3.6 2.4-4.5"/><path d="M12.5 5.2c1.4-1.3 3.4-1.2 4.3-.4-1 1-2.9 1.2-4.3.4z"/>' },
  bakedApple: { name: 'Baked apple', use: 'eat', r: 0.04, color: 0x7a3a1c, icon: '<path d="M12 10.5c-2-1.8-5.8-1.3-5.8 3.2 0 3.8 2.3 7.3 4.1 7.3.7 0 1-.4 1.7-.4s1 .4 1.7.4c1.8 0 4.1-3.5 4.1-7.3 0-4.5-3.8-5-5.8-3.2z"/><path d="M12 10.5c0-1.4.5-2.4 1.5-3"/><path d="M8 7.2c-.8-1 .8-1.8 0-2.9M16 7.2c-.8-1 .8-1.8 0-2.9"/>' },
  berry: { name: 'Berries', use: 'eat', r: 0.016, color: 0x8e1a2c, icon: '<circle cx="8.5" cy="14" r="3"/><circle cx="15.5" cy="14" r="3"/><circle cx="12" cy="19" r="2.6"/><path d="M12 11V5.5M12 7l3.5-2.5M12 8.5L8.5 6"/>' },
  mushroom: { name: 'Bolete', use: 'cook', cook: 'roastedMushroom', hint: 'Roast it over a fire', r: 0.04, color: 0x6b3e1c, icon: '<path d="M3.5 12.5C3.5 7.6 7.4 4.5 12 4.5s8.5 3.1 8.5 8z"/><path d="M9.5 12.5v5.8c0 1.3 1.1 2.2 2.5 2.2s2.5-.9 2.5-2.2v-5.8"/>' },
  roastedMushroom: { name: 'Roasted bolete', use: 'eat', r: 0.04, color: 0x4a2612, icon: '<path d="M4 14.5c0-4.2 3.6-6.8 8-6.8s8 2.6 8 6.8z"/><path d="M9.8 14.5v4.3c0 1.2 1 1.9 2.2 1.9s2.2-.7 2.2-1.9v-4.3"/><path d="M9 5.6c-.8-1 .8-1.8 0-2.9M15 5.6c-.8-1 .8-1.8 0-2.9"/>' },
  cone: { name: 'Spruce cone', use: 'throw', r: 0.035, color: 0x6b4a2a, icon: '<path d="M12 3c3.2 3.2 5 7.2 5 11.2a5 5 0 0 1-10 0C7 10.2 8.8 6.2 12 3z"/><path d="M8.2 10.5h7.6M7.4 14.5h9.2M9.3 7h5.4M8.5 18h7"/>' },
  stick: { name: 'Stick', use: 'throw', r: 0.02, color: 0x6a5238, icon: '<path d="M4 20L20 4"/><path d="M10.5 13.5L7 10M14.5 9.5l1.2 3.6"/>' },
  pebble: { name: 'Pebble', use: 'throw', r: 0.025, color: 0x8b857a, icon: '<path d="M4.5 15.5c0-4.2 4-7.5 8.3-7.5 3.7 0 6.7 2.6 6.7 5.9 0 3.1-3.2 4.6-7.4 4.6-4.6 0-7.6-.9-7.6-3z"/><path d="M9 12.5c1.2-1 2.6-1.4 4-1.3"/>' },
  fish: { name: 'Fish', use: 'cook', cook: 'grilledFish', hint: 'Cook it over a fire', r: 0.06, color: 0x8f9ca3, icon: '<path d="M2.5 12c3.2-4.2 8.6-5.2 12.8-2.6L20 6v12l-4.7-3.4C11.1 17.2 5.7 16.2 2.5 12z"/><circle cx="7.4" cy="11.2" r=".9"/>' },
  grilledFish: { name: 'Grilled fish', use: 'eat', r: 0.06, color: 0x7a4a22, icon: '<path d="M2.5 12c3.2-4.2 8.6-5.2 12.8-2.6L20 6v12l-4.7-3.4C11.1 17.2 5.7 16.2 2.5 12z"/><circle cx="7.4" cy="11.2" r=".9"/><path d="M9 9.5l-1.5 5M12.5 9l-1.5 6"/>' },
  goldenFish: { name: 'Golden fish', use: 'keep', hint: 'Put it on the shelf in the cabin', r: 0.06, color: 0xe2b035, icon: '<path d="M2.5 12c3.2-4.2 8.6-5.2 12.8-2.6L20 6v12l-4.7-3.4C11.1 17.2 5.7 16.2 2.5 12z"/><circle cx="7.4" cy="11.2" r=".9"/><path d="M19 2.5v3M17.5 4h3"/>' },
  shell: { name: 'Shell', use: 'throw', r: 0.03, color: 0xe6d6bd, icon: '<path d="M12 20L4.2 10.6a8.4 8.4 0 0 1 15.6 0z"/><path d="M12 20L7.6 7.4M12 20V6.3M12 20l4.4-12.6M12 20L5.3 9.3M12 20l6.7-10.7"/>' },
  rareShell: { name: 'Nautilus shell', use: 'keep', hint: 'Put it on the shelf in the cabin', r: 0.04, color: 0xf0e2cc, icon: '<path d="M12 12.2a1.3 1.3 0 1 1 1.3-1.3 2.6 2.6 0 0 1-2.6 2.6 3.9 3.9 0 0 1-3.9-3.9 5.2 5.2 0 0 1 5.2-5.2 6.5 6.5 0 0 1 6.5 6.5c0 4.3-3.4 7.8-7.7 7.8H6"/><path d="M19.5 2.5v3M18 4h3"/>' },
  driftwood: { name: 'Driftwood', use: 'throw', r: 0.05, color: 0xb9b2a6, icon: '<path d="M3 17.5c2.6-.2 5-1.2 7.6-2.4 2.8-1.3 5.6-2.6 9.9-2.8l.5 2.6c-3.9.4-6.5 1.6-9.3 2.8-2.7 1.2-5.3 2.1-8.4 2.3z"/><path d="M12.8 14.1c.6-1.6 1.8-3 3.6-4.1"/><path d="M7 17.2l2.4-.9M14.5 14.6l2.2-.6"/>' },
  petal: { name: 'Rose petal', use: 'release', r: 0.018, color: 0xc0283c, icon: '<path d="M12 20.5c-5.2-3-6.5-9.4-3.2-15 2.1 2.9 6.2 3.2 8.4 2 1.2 6.2-.8 10.6-5.2 13z"/><path d="M12 20.5c-.2-4.4 1-8.4 4-11.6"/>' },
};
/** The icon of a kind as an SVG string, `size` px. */
export const iconSvg = (kind, size = 28) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KINDS[kind].icon}</svg>`;
