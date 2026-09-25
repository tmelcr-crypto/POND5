# Test walkthrough (once every "yes" from IMPROVEMENTS.md is built)

One long play session on the iPad, in an order where each step sets up the next, so every feature is touched at
least once and the ones that share buttons, the inventory or saving are exercised together (that is where most bugs
hide). Tick each line; when something is wrong, a screenshot and one sentence ("I did X, expected Y, got Z") is enough.
Keep the Stats overlay on for the whole run and note the fps at the marked points (**fps**).

Before you start: settings panel, Reset progress (#75), confirm. Reload the page.

## 0. Start
- [ ] Loading screen (#89): the painted island shows with the progress; no blank or frozen moment before Start.
- [ ] Soundtrack (#81) is off by default; switch it on in settings, it fades in; switch off again later in step 9.
- [ ] Summer, day 1; the Season picker says Summer. **fps** at the start view.
- [ ] Dynamic resolution (#87): turn quickly on the spot for 10 s; the image may soften for a moment and sharpen again,
      never flicker between the two.

## 1. The cabin and its surroundings (morning)
- [ ] Walk in and out: footstep sounds (#80) change between grass, stone path, wooden floor and porch.
- [ ] Curtains (#54): open and close each curtain; the light in the room changes.
- [ ] Candles and lanterns one by one (#56): light and put out each; the Cabin lights switch still does them all.
- [ ] Fireplace: light it (no items needed); chimney smoke (#55) starts; put it out, the smoke stops after the embers.
- [ ] Carry the lantern (#22): take it from the porch bench (icon beside it, or T), walk outside at dusk: it swings in
      your hand and lights the grass and ground round you; put it back on the bench. Reload while carrying: still carried.
- [ ] Hunger meter (#1): note where it is; it slowly drains; it never reaches empty.
- [ ] Well (#12, behind the cabin): the icon (or T) draws a bucket: crank, splash, the bucket comes up full; a cup of
      water in your slots, Use says Drink.
- [ ] Garden (#8): sow every plot of the three beds behind the cabin; come back in step 6 to harvest (carrots raw,
      potatoes and a pumpkin cooked at a fire).
- [ ] Signposts (#19): at the three forks (bridge, jetty path, forest path) every board points along its path and the
      distances look right; walk round a post (it is solid); read a board from both sides.
- [ ] The treasure map (#16) is found in the cabin; keep it for step 5.

## 2. Meadow and forest (midday)
- [ ] Rabbits (#38) hop in the meadow and dart into bushes when you come close.
- [ ] Squirrels (#39) run up the spruces and sometimes drop a cone you can pick up.
- [ ] Mushrooms (#10) in the forest: pick brown boletes (fly agarics cannot be picked); none in winter.
- [ ] Planting (#7): with an apple, then a cone selected, look down at open meadow: Use says Plant (not on a path, the
      beach or next to a tree); note the places; they grow over the next days.
- [ ] Take 10 sticks from the forest woodpile; the 11th is refused. Light the forest firepit with 3 sticks.
- [ ] Sit on a log, cook an apple and a mushroom (#4); stand up during a third cook: the raw one comes back.
- [ ] God rays (#92) through the trees; sun-ray look again in the morning mist in step 7.
- [ ] Lie down at a view spot (#99): only at the 5 spots (lower grass there), only lying, no sleep; get up again.
- [ ] Time-lapse (#79) while sitting or lying: hold it; the sun and clouds move; letting go returns to normal speed.

## 3. The hill, the stones, the cave, the treehouse (afternoon)
- [ ] Standing stones / ruins (#66) on the highest hill: walk round them, nothing to fall through.
- [ ] Cave (#63): walk in with and without the lantern; find what is inside; walk out.
- [ ] Treehouse (#58): climb the rope ladder, look out, climb down; try to walk off the edge.
- [ ] Album picture (#13): be at a picture's place at its time (or do its action there); the picture arrives in the album.

## 4. The beach and the sea (late afternoon)
- [ ] Tides (#68): note where the waterline is on the beach; check again in an hour of game time; the jetty stairs
      and the boat's berth still work at high and low water.
- [ ] Seagulls (#44) over the beach and on the jetty posts; their calls.
- [ ] Beachcombing (#18): pick shells and driftwood; throw a shell and a piece of driftwood; light the beach firepit
      with 3 driftwood. (The nautilus is 1 in 10 000 shells: do not wait for it.)
- [ ] Message in a bottle (#17): find one, read it; it goes into the album / journal.
- [ ] Fishing from the jetty: cast, strike, catch; miss once on purpose; reel in empty once.
- [ ] Board the boat, sail out to the islet (#26); anchor (#30) off it; fish from the boat; weigh anchor.
- [ ] Land on the islet (jump ashore), find what is there, sail back, dock.
- [ ] **fps** on the boat at sea, and at the lit beach firepit.

## 5. Evening and night
- [ ] Treasure (#16): follow the map to the dirt pile, interact, open the chest.
- [ ] Daily tasks (#15): finish today's; the stamp appears in the journal; leave one unfinished (nothing happens).
- [ ] Frogs (#40) croak at dusk at the pond and jump in as you pass.
- [ ] Cook a fish at a firepit at night; eat it; the hunger meter rises.
- [ ] Sleep in the bed. On waking: the day has moved on, tasks are new.

## 6. Days 2 to 10 (use sleep and the time slider)
- [ ] Rain showers and a thunderstorm (#31): a lit fire in the open goes out, the one under cover (fireplace) not;
      rain sound on the roof inside.
- [ ] Rainbow (#33) when the sun comes out after rain.
- [ ] A fog morning (#32).
- [ ] The garden is grown; harvest it. The planted sapling has grown a little.
- [ ] Decorate the cabin (#47): place shells, flowers, pebbles on the shelves and table; the unique shell (#18) and
      the golden fish go on the keepsake shelf.
- [ ] Seasonal sky (#93): note the summer light; compare in autumn and winter.

## 7. The seasons
- [ ] Sleep past day 10: wake in autumn with the name on screen. Leaves colour and fall, the sky is hazier (#93),
      mushrooms, fewer birds (#94).
- [ ] Autumn fog morning with sun rays in the mist (#92).
- [ ] Winter (sleep on): snow, snow on the spruces too (#95), almost no birds (#94), the pond frozen and walkable,
      snowfall, short days.
- [ ] Warmth (#2): stay outdoors in winter: frost creeps in at the screen's corners and sides; a fire, the cabin or
      a cooked meal clears it. It never does more than that.
- [ ] Northern lights (#35) on a clear winter night.
- [ ] Spring: blossom, fresh green, the saplings you planted have grown on.
- [ ] **fps** in winter and in spring at the start view.

## 8. Saving
- [ ] Export the save (#90); Reset progress (#75); import the save: everything is back (inventory, chest, shelf,
      decorations, garden, saplings, fires, season, tasks, album, map found).
- [ ] Reload the page mid-activity (fishing, cooking, sailing, lying at a view spot): nothing is lost or duplicated.

## 9. Try to break it (10 minutes)
- [ ] Press two buttons at once: Cook and Stand, Fish and Board, Sleep and Use.
- [ ] Full inventory while picking, catching, cooking, harvesting, opening the treasure.
- [ ] Walk into everything new: stones, cave walls, treehouse, well, garden fence, signposts, rocks on the islet.
- [ ] Switch the Season picker while cooking, fishing, sailing, sitting and in bed.
- [ ] Let the game run for 10 minutes untouched at night by a lit firepit; **fps** after 5 and 10 minutes.
- [ ] Soundtrack off again; settings panel values survive a reload.
