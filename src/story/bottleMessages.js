/**
 * Captain Elias's messages in bottles (#17): 25 days, one to a bottle (app/bottles.js washes them up on the beaches out
 * of order; app/journal.js keeps what you have read). *italic* and **bold** as written; a blank line between paragraphs.
 */
export const MESSAGES = [
  `To whoever finds this,

My name is Captain Elias. I am sailing across the Bluewater Sea in my little boat, *The Seagull*. Today the wind is calm, the sky is clear, and I have decided to write one message every day.

Maybe someone will find them someday.`,
  `This morning I saw three dolphins swimming beside my boat.

One of them jumped so high it nearly splashed my breakfast.

I threw this bottle into the sea just after sunrise.

I wonder where it will go.`,
  `A storm is coming.

The clouds are getting darker, so I tied everything down.

Before the rain arrives, I am sending another bottle.

If you find it, I hope your weather is better than mine.`,
  `The storm passed!

The boat is fine, but my hat is gone.

Somewhere in this ocean there may now be a very fashionable fish.

Today I saw something strange floating far away.

It looked like a wooden box.`,
  `I reached the wooden box.

It was covered in barnacles and tied with old rope.

Inside was only one thing: a small brass key.

No lock. No note.

Just a key.

That is rather mysterious.`,
  `Today I found something even stranger.

A piece of wood floated past my boat with a star carved into it.

The same little star is scratched onto the brass key.

I think the two things belong together.`,
  `I checked my old sea map.

There is a tiny island nearby with no name.

Someone drew a little star beside it many years ago.

Maybe that is where the key came from.

I am changing course.`,
  `The island is still far away, but I can see trees through my telescope.

There also seems to be an old wooden dock.

I will not go ashore yet.

The water around it looks very shallow.`,
  `I sailed around the island today.

On the western side, I spotted a small cave near the water.

Above it is the same star symbol.

Whoever made this key definitely knew this island.`,
  `I found another floating bottle today.

Inside was a very old message.

It said:

*“Follow the stars. Find what we left behind.”*

It was signed with two letters:

**E + A**

Who were they?`,
  `I searched my ship's old papers.

My grandfather once sailed these waters!

His name was Elias too.

And his best friend was named Arthur.

E + A.

I think I just found their message.`,
  `Grandfather used to tell me stories about a secret island when I was little.

I thought he invented them.

Perhaps he did not.

He also told me about something called the Friendship Chest.`,
  `The wind pushed me away from the island today.

I cannot reach it safely.

So I am sending another bottle instead.

Maybe these messages will reach the island before I do.

That would be funny.`,
  `I found Grandfather’s old notebook.

One page says:

*“The chest is not filled with gold.”*

Well, there goes my plan to become the richest sailor in the world.`,
  `Another page says:

*“The treasure only matters if someone remembers the adventure.”*

I am beginning to think the chest contains memories.

Old photographs, perhaps.

Or drawings.

Or terrible jokes.

Grandfather loved terrible jokes.`,
  `The sea is calm again.

I can see the island clearly.

Near the dock is a crooked tree.

Grandfather’s notebook says:

*“Seven steps from the crooked tree.”*

That sounds like a clue.`,
  `I still cannot land because the tide is too low.

But through my telescope, I spotted something shiny near the crooked tree.

Maybe a metal box.

I wish I had a longer telescope.

Or much longer arms.`,
  `A strong current is pulling me away again.

I may not reach the island this time.

So I am putting the brass key inside another bottle.

No, wait.

That seems like a terrible idea.

I will keep the key.`,
  `I discovered something written on the back of the old map.

It says:

*“The key opens the chest beneath the old dock.”*

So the crooked tree was only another clue.

Grandfather always loved making things complicated.`,
  `Now I understand.

Grandfather and Arthur made the Friendship Chest when they were children.

They filled it with things from their adventures and hid it on the island.

They planned to return one day.`,
  `But they never returned together.

Life carried them in different directions.

Grandfather kept the map.

Arthur must have kept the first message.

Somehow, both ended up back at sea.`,
  `Tomorrow I must turn home.

My food is running low, and the wind is changing.

I can see the island, but I cannot safely reach the dock.

So the chest will remain hidden.

For now.`,
  `I have made a decision.

I am throwing these messages into the water around the island.

Maybe someone exploring the beach will find them.

Maybe that person will finish the adventure for us.`,
  `If you have found several of my bottles, you probably know what to do now.

Find the old dock.

Look underneath it.

Search for a wooden lid.

And if you find the Friendship Chest, please open it carefully.

Those memories are older than both of us.`,
  `My final message.

I never reached the treasure.

But perhaps that was never my job.

Maybe my job was simply to send the clues to the right person.

And if you are reading this...

that person might be you.

Good luck, explorer.

— Captain Elias, aboard *The Seagull*`,
];
/** A message as HTML paragraphs (italic, bold kept). */
export function messageHtml(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return text.split(/\n\s*\n/).map(p => '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>') + '</p>').join('');
}
