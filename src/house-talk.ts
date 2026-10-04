/**
 * What friends say in the cottage (house-life.ts shows it in the speech bubble). Lines are original, written in the
 * style of little kids' chatter (literal logic, big wonder, tiny complaints) while a friend is small (growth stage 0),
 * and of grown-ups' easy household talk (chores, small worries, dry jokes) once grown (stages 1-2). Each room has its
 * own pool; every friend also has a few lines of their own (Sprout gardens, Clover farms, Pepper cooks), and two
 * friends in a room sometimes trade a line and a reply. Vietnamese is in locales/vi-house-talk.ts.
 *
 * A TalkBag deals lines like cards: none repeats until three quarters of its pool has been used.
 */
import type { RoomId } from './house.ts';

export type Age = 'kid' | 'grown';
export const ageOf = (stage: number): Age => stage > 0 ? 'grown' : 'kid';

export const ROOM_TALK: Record<RoomId, Record<Age, string[]>> = {
  living: {
    kid: [
      'If I sit very still, the sofa thinks I am a cushion.',
      'I built a pillow fort. Nobody may enter without a snack.',
      'Is the fire hungry? It keeps eating the logs.',
      'I counted the trophies. There are lots. Lots is a number.',
      'When I grow up I want to be taller. That is my whole plan.',
      'The radio is singing again. Can it hear us back?',
      'I am not tired. My eyes are just resting with the lights off.',
      'Can we have a party? A small one? With cake?',
      'I found a crumb in the sofa. Finders keepers!',
    ],
    grown: [
      'Ah, the sofa. My favourite place in all nine worlds.',
      'Someone keeps moving the cushions. I know it is you.',
      'Nothing beats a warm fire after a long day out.',
      'Look at that trophy shelf. We will need a bigger shelf.',
      'Put the kettle on, would you? Just one cup. Maybe two.',
      'I sat down for one minute and an hour went by.',
      'This tune again? Fine. It is a good tune.',
      'You could at least wipe your boots before the rug.',
      'A quiet evening at home. Exactly what I ordered.',
    ],
  },
  kitchen: {
    kid: [
      'Can I lick the spoon? Just the spoon. Not the pot.',
      'Carrots help you see in the dark. I am trying it now.',
      'I am not hungry. My tummy is just very loud.',
      'Why is it called a cupcake if you cannot drink it?',
      'I helped! I stirred it twice and only spilled once.',
      'The kettle is whistling. Who taught it that song?',
      'I want soup with no green bits. Only happy bits.',
      'Is it dinner yet? How about now? How about now?',
      'If I eat my peas fast, do they count as dessert?',
    ],
    grown: [
      'Who left the lid off the honey jar? Again?',
      'A pinch of salt, a pinch more, and… perfect.',
      'Soup is nearly ready. Do not touch the pot.',
      'Fresh veggies from our own garden taste twice as nice.',
      'I will do the dishes. Tomorrow. First thing.',
      'Tea is the answer. I forget the question.',
      'We are out of sugar. And someone ate the last biscuit.',
      'Smell that? That is the smell of a well-earned lunch.',
      'Cooking for friends is my favourite kind of busy.',
    ],
  },
  craft: {
    kid: [
      'I painted a cat. It looks like a potato. A cat potato.',
      'Glitter goes everywhere. Even in my ears.',
      'This is a dragon. Or a cloud. It is still deciding.',
      'I made you a present. Please do not look until I say.',
      'Blue and yellow made green! I am a wizard!',
      'Can I hammer something? Anything? Please?',
      'My picture needs more purple. Everything needs more purple.',
      'I drew our house, but bigger, with a slide on the roof.',
      'Oops. That was not supposed to be glued to my hand.',
    ],
    grown: [
      'Measure twice, cut once. I measured three times, to be safe.',
      'That painting is coming along nicely. Bold use of orange.',
      'Has anyone seen the good scissors? They walk off by themselves.',
      'One more coat of paint and it is done. Probably.',
      'A tidy workbench is a happy workbench. In theory.',
      'I keep every string and button. You never know.',
      'The light in here is perfect for painting this time of day.',
      'Making something by hand is the best kind of slow.',
      'Careful, that paint is still wet. Ask me how I know.',
    ],
  },
  bedroom: {
    kid: [
      'I am not sleepy. I am just practising yawning.',
      'Can you check under the bed? Just in case it is a monster. A nice one.',
      'One more story. A short one. A medium one.',
      'My teddy is scared of the dark, so the light stays on.',
      'I can jump on the bed? No? What about bounce a little?',
      'When I dream, I can fly. And eat ice cream for lunch.',
      'My socks are lost. They went on holiday without me.',
      'Is it morning yet? It feels like it should be morning.',
      'I tucked myself in all by myself. Look, a burrito!',
    ],
    grown: [
      'A proper bed and a proper sleep. That is luxury.',
      'I will fold the laundry. Right after this little lie-down.',
      'Who knew pillows could be this fluffy?',
      'Early night tonight. I mean it this time.',
      'This wardrobe is full and I still have nothing to wear.',
      'Ah, morning stretches. Everything goes pop.',
      'Open the curtains, the garden looks lovely today.',
      'Five more minutes. Then I am up. Ten at most.',
      'Sweet dreams, everyone. No snoring this time, please.',
    ],
  },
  bath: {
    kid: [
      'The duck says the water is too warm. I asked him.',
      'Bubbles! I have a bubble beard! Call me Grandpa!',
      'My fingers went all wrinkly. Am I turning into a raisin?',
      'I brushed my teeth. Well, I brushed one tooth really well.',
      'Can I stay in the bath until I am a fish?',
      'Where does the water go when it goes down the hole?',
      'The mirror is foggy. I drew a smiley face.',
      'Soap is slippery on purpose. It does not want to be used.',
      'Splash! Oops. The floor wanted a bath too.',
    ],
    grown: [
      'A hot bath fixes almost everything.',
      'Who used all the hot water? I have my suspicions.',
      'Hang your towel up, it will dry much faster.',
      'Look at that sparkle. I scrubbed this sink myself.',
      'The duck stays. The duck always stays.',
      'Two minutes for teeth. The whole two minutes.',
      'Ah, fresh as a daisy. A slightly damp daisy.',
      'Mind the floor, it is slippery after the bath.',
      'Bubble baths after a long day are a must.',
    ],
  },
  study: {
    kid: [
      'This book has no pictures. How do they know what happens?',
      'I read a whole page! Well, I looked at it very hard.',
      'If I spin the globe and stop it, can we go there?',
      'Did you know some fish can glow? I want to glow.',
      'Shh! The books are sleeping. Read quietly.',
      'I am writing a diary. Today I was brave. Twice.',
      'How many worlds are there? More than ten? More than eleven?',
      'Is that star a planet? Can we visit it after lunch?',
      'I know all my letters except the wiggly ones.',
    ],
    grown: [
      'Just one more chapter. Then bed. Honestly.',
      'This map shows a world we have not been to yet.',
      'The bookshelf is full. Time to build another bookshelf.',
      'Note to self: write down where you put your notes.',
      'Quiet in here. Perfect for thinking big thoughts.',
      'I read that some fish only bite at sunrise. Interesting.',
      'Our collection is really growing. Look at these pages.',
      'Planning tomorrow already. Big day, lots of watering.',
      'A good book and a cup of tea. That is my evening.',
    ],
  },
};

/** Each friend's own lines, picked now and then in any room. */
export const PERSONA_TALK: Record<string, Record<Age, string[]>> = {
  garden: {
    kid: ['I planted a jelly bean. Tomorrow we get a jelly bean tree!', 'Worms are my friends. They are very wiggly friends.', 'I whispered to the carrots so they grow faster.', 'The tomatoes are blushing. I think they like me.', 'I told the pumpkin a joke. It did not laugh. It is very round and very serious.', 'The robot waits and the plants get taller. We are both very patient!'],
    grown: ['The beds need water at sunrise, before the heat.', 'I swear the pumpkins grow while you watch them.', 'Upgraded beds are wonderful. Everything grows so quickly now.', 'The robot lets the crops stand a while. Honestly, the garden looks lovely like this.', 'Radishes are the gossips of the garden. Everything pokes out sooner or later.', 'A full bed in the sun. I could stand here all afternoon. And I will.'],
  },
  farm: {
    kid: ['The chickens said hello. Well, they said bok. Same thing.', 'I want to ride a cow. A slow one.', 'The pig rolled in mud and looked so happy!', 'The cow looked at me for a very long time. I think we are best friends now.', 'Eggs are warm. Why are eggs warm? Were they hugged?', 'I counted the sheep to fall asleep, but they kept moving.'],
    grown: ['The hens laid six eggs this morning. Good girls.', 'Feeding time is the best time. Everyone is so pleased to see me.', 'A farm never sleeps. But I do. Goodnight.', 'The pig has opinions about breakfast. Loud ones.', 'Milk before sunrise, eggs after. Everyone has a schedule except the goat.', 'Nothing makes a boss smile like a full basket. Look at that grin!'],
  },
  cook: {
    kid: ['I made a soup! It is mostly water and one carrot.', 'Pancakes are just flat cakes. Flat cakes are the best cakes.', 'Can I crack the egg? I will be gentle. Mostly.', 'I stirred the soup seven times. Seven is the lucky number for soup.', 'Is it sneezing or is it steam? The pot is being mysterious.', 'I want to be a chef and a dragon. Dragons can toast the bread.'],
    grown: ['A pinch of chili wakes up any stew.', 'Good food, good friends, good evening.', 'Never trust a cook who does not taste as they go.', 'Fresh from the garden today. The carrots practically jumped in the pot.', 'If the boss smells dinner, I have done my job.', 'Salt is easy to add and impossible to take out. Ask my first stew.'],
  },
};

/** Lines for the boss (the player): a friend says one when the explorer stops beside them; the boss mutters the last pool. */
export const BOSS_TALK: Record<Age, string[]> = {
  kid: [
    'Boss! Boss! I did something! I forgot what. But it was big!',
    'Boss, can you carry me? Only a little bit. To the moon.',
    'The boss is back! Did you bring snacks? Even a leaf would do.',
    'Boss, your boots are very big. Can I wear one as a boat?',
    'I tidied up! Everything is in one big pile. Very organised.',
    'Boss, you are the bestest. Please do not tell the others I said so.',
    'Shh, the boss is here. Everybody look busy! Hold this spoon!',
    'Boss, I grew an entire millimetre. Measure me!',
  ],
  grown: [
    'Welcome home, boss. The house behaved. Mostly. The kettle sulked.',
    'Boss, the garden is thriving. I would say it is because of me, but the robot is listening.',
    'Good to see you, boss. Dinner in ten minutes. Or twenty. Cooking is not an exact science.',
    'Boss, you have leaves in your hair. It suits you, honestly.',
    'We saved you the comfy seat. Well, we argued over it first.',
    'Everything is under control, boss. Do not look behind the sofa.',
    'The crops are standing tall just for you, boss. They practised all morning.',
    'Another day, another basket. You work too hard, boss. Sit. Tea.',
  ],
};
export const BOSS_SELF_TALK: string[] = [
  'Home sweet home. Sweeter with snacks.',
  'Right. Where did I leave my sword? And my keys? And my dignity?',
  'Being the boss mostly means knowing where the biscuits are.',
  'I wonder if the pumpkins are plotting something.',
  'Everyone is working so hard. I will supervise. From the sofa.',
  'The garden looks great. Let the plants show off a little longer.',
  'Note to self: wipe the boots. Second note: ignore the first note.',
  'A little tea, a little quiet, a little nap. In that order.',
];

/** Two-friend exchanges: a line, then another friend in the room replies. */
export const EXCHANGES: Record<RoomId, [string, string][]> = {
  living: [['Is it my turn on the comfy cushion?', 'It is always your turn, apparently.'], ['Who wants to hear about my day?', 'Only if it ends with a snack.'], ['Who moved my cushion?', 'It moved itself. It is a very brave cushion.']],
  kitchen: [['What is for dinner?', 'Food. Now set the table, please.'], ['Can I help cook?', 'Yes! Start by washing those hands.'], ['Is the soup supposed to be purple?', 'It is a surprise soup. Surprise!']],
  craft: [['Do you like my painting?', 'I love it. Which way up does it go?'], ['I need the glue.', 'It is stuck to your elbow.'], ['Look, I made a hat!', 'That is a bucket. A lovely bucket.']],
  bedroom: [['Are you awake?', 'I am now.'], ['Goodnight!', 'Goodnight! Do not let the bed bugs bite. We do not have any.'], ['I cannot sleep. The dark is so loud.', 'Count the garden plants. Slowly. They are standing very tall.']],
  bath: [['Bath time!', 'Do I have to? I was clean last week.'], ['Have you seen the duck?', 'He is in the bath. Where else would he be?'], ['Why is the duck wearing my towel?', 'He is the boss of the bath. Obviously.']],
  study: [['What does this word mean?', 'Look it up. That is what the big book is for.'], ['Shh, I am reading.', 'You are holding it upside down.'], ['What is the longest word you know?', 'Dinner. It feels long when I wait for it.']],
};

/** Deals lines from a pool without repeats until most of it (three quarters) has been used, then starts over. */
export class TalkBag {
  private used = new Map<string, Set<number>>();
  pick(key: string, pool: readonly string[], random = Math.random): string {
    if (!pool.length) return '';
    let used = this.used.get(key); if (!used) this.used.set(key, used = new Set());
    if (used.size >= Math.ceil(pool.length * .75)) used.clear();
    const free = pool.map((_, i) => i).filter(i => !used!.has(i)), i = free[Math.floor(random() * free.length)] ?? 0;
    used.add(i); return pool[i];
  }
}

export interface Talker { room: RoomId; stage: number; role: string }
/** One line for this friend: a quarter of the time their own, otherwise the room's, by age. */
export function lineFor(bag: TalkBag, f: Talker, random = Math.random): string {
  const age = ageOf(f.stage), own = PERSONA_TALK[f.role]?.[age];
  if (own && random() < .25) return bag.pick(`${f.role}:${age}`, own, random);
  return bag.pick(`${f.room}:${age}`, ROOM_TALK[f.room]?.[age] ?? ROOM_TALK.living[age], random);
}
/** A line and its reply for this room. */
export function exchangeFor(bag: TalkBag, room: RoomId, random = Math.random): [string, string] | null {
  const pool = EXCHANGES[room]; if (!pool?.length) return null;
  const first = bag.pick(`x:${room}`, pool.map(p => p[0]), random); return pool.find(p => p[0] === first) ?? null;
}

/** A friend next to the boss greets them. */
export const bossLine = (bag: TalkBag, stage: number, random = Math.random) => bag.pick('boss:' + ageOf(stage), BOSS_TALK[ageOf(stage)], random);
/** The boss's own mutter. */
export const bossSelfLine = (bag: TalkBag, random = Math.random) => bag.pick('boss:self', BOSS_SELF_TALK, random);
