/**
 * Talking with an AI neighbour in the message box (bots.ts): the player's words are sorted into a few intents by keywords
 * (English or Vietnamese, accents ignored) and the neighbour answers from a pool for that intent. Replies are English (the
 * Vietnamese is looked up by that text in locales/vi-bot-chat.ts), dealt like cards so they rarely repeat; friends answer a little warmer than strangers.
 */
import type { BotDef } from './bot-logic.ts';

export type Intent = 'hello' | 'how' | 'thanks' | 'bye' | 'garden' | 'gift' | 'outfit' | 'fly' | 'friend' | 'joke' | 'praise' | 'name' | 'sad' | 'question' | 'other';
/** Lower-case, no accents (đ -> d), so "Xin chào" and "xin chao" match the same key. */
export const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0111/g, 'd').replace(/\?/g, ' ? ').replace(/[^a-z0-9? ]+/g, ' ').replace(/\s+/g, ' ').trim();
const KEYS: Array<[Intent, string[]]> = [
  ['name', ['your name', 'who are you', 'ten gi', 'ten ban', 'ban la ai']],
  ['how', ['how are you', 'how r you', 'how do you do', 'what s up', 'whats up', 'khoe khong', 'khoe ko', 'the nao', 'dang lam gi', 'what are you doing']],
  ['gift', ['gift', 'gifts', 'present', 'presents', 'give me', 'qua tang', 'tang qua', 'cho minh qua']],
  ['bye', ['bye', 'goodbye', 'see you', 'good night', 'tam biet', 'hen gap lai', 'ngu ngon']],
  ['thanks', ['thank', 'thanks', 'thank you', 'cam on']],
  ['outfit', ['outfit', 'costume', 'clothes', 'wear', 'dress', 'hat', 'do dep', 'trang phuc', 'quan ao', 'bo do', 'cai mu', 'chiec mu']],
  ['fly', ['fly', 'flying', 'wings', 'sky', 'bay', 'canh']],
  ['friend', ['friend', 'friends', 'be my', 'ban be', 'ket ban', 'lam ban']],
  ['garden', ['garden', 'farm', 'plant', 'plants', 'crop', 'crops', 'animal', 'animals', 'vuon', 'trong cay', 'trong trot', 'cay', 'nong trai', 'thu cung', 'gia suc']],
  ['joke', ['joke', 'funny', 'laugh', 'haha', 'lol', 'hai huoc', 'cuoi', 'dua vui']],
  ['praise', ['cool', 'awesome', 'great', 'nice', 'amazing', 'love', 'beautiful', 'tuyet', 'gioi', 'dep', 'thich', 'hay qua']],
  ['sad', ['sad', 'tired', 'lonely', 'bored', 'buon', 'met qua', 'met roi', 'dang met', 'chan', 'co don']],
  ['hello', ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'xin chao', 'chao', 'alo']],
];
export function intentOf(text: string): Intent {
  const s = ' ' + normalize(text) + ' ';
  for (const [intent, keys] of KEYS) if (keys.some(k => s.includes(' ' + k + ' '))) return intent;
  return s.includes(' ? ') ? 'question' : 'other';
}
export const CHAT_REPLIES: Record<Intent, ReadonlyArray<string>> = {
  hello: ['Hello, {name}! So nice to hear from you.', 'Hi hi! I was just thinking about the garden. And you!', 'Hey {name}! What a lovely day to chat.', 'Hello! You always make my day brighter.'],
  how: ['I am wonderful, thank you! The sun is out and so are my ideas.', 'Pretty good! I walked all around the garden and met a butterfly.', 'Doing great. How about you? Are you taking care of yourself?', 'Happy as a seed in spring. And you?'],
  thanks: ['Anytime, {name}! That is what friends are for.', 'You are very welcome. It makes me happy too.', 'Aw, no need to thank me. You are the kind one!'],
  bye: ['Bye for now, {name}! Come back soon.', 'See you! Say hi to your plants for me.', 'Sweet dreams and good luck out there!'],
  garden: ['Gardens are my favourite. Every plant is a tiny story.', 'Mine has tomatoes, a goat and a very bossy goose. Visit me!', 'Water them a little every day and they will repay you with fruit.', 'Your garden is growing so well. I can tell you care.'],
  gift: ['Friends do share nice things now and then. Keep meeting me!', 'Gifts are better as a surprise. I will think of something!', 'Patience, {name}. Good things come to friends who chat.'],
  outfit: ['I love dressing up. Fashion is just confidence you can wear.', 'Thanks! I picked this outfit after trying on everything.', 'A good hat makes any day better. Trust me.'],
  fly: ['Flying feels like a happy dream. The garden looks tiny from up there!', 'I cannot fly myself, but I love watching the ones who can.', 'Wings or no wings, you can always reach for the sky.'],
  friend: ['Friends are the best crop of all. They grow slowly and last forever.', 'I am glad we met, {name}. Truly.', 'A friend is someone who listens, like you do.'],
  joke: ['Why did the carrot win? Because it was a root of all fun!', 'I tried to tell a farm joke, but it was too corny.', 'Haha! You made me snort like a little piglet.', 'What do you call a sleeping goat? A nanny-nap! Okay, I will stop.'],
  praise: ['Aw, thank you! You are the cool one around here.', 'You are too kind, {name}. My cheeks are blushing.', 'That is so sweet. Keep that kind spirit!'],
  name: ['I am {me}! Nice to meet you properly, {name}.', 'They call me {me}. Level {level}, and proud of it!'],
  sad: ['Oh no. Take a deep breath, {name}. Things get better, I promise.', 'I am here for you. Maybe a walk in the garden will help?', 'Even the tallest tree started as a seed on a hard day. You will grow too.'],
  question: ['Hmm, good question. I will think about it while I walk.', 'I am not sure, {name}. What do you think?', 'Ooh, interesting! Ask me again later, I might have an answer.'],
  other: ['Tell me more, I like hearing from you.', 'That is nice, {name}. The valley is better with you in it.', 'Hehe, I like the way you think.', 'Mm-hm! Go on, I am listening.', 'You always have something interesting to say.'],
};
/** Lines only a friend says now and then, so a friendship feels warmer than a first hello. */
export const FRIEND_EXTRA: ReadonlyArray<string> = [
  'I am so happy we are friends, {name}.',
  'Come visit my garden any time. The door is always open.',
  'Meeting you is one of the best parts of my day.',
];

export interface ChatDeps { pick: (key: string, pool: readonly string[]) => string; rand: () => number }
/** The English text of the neighbour's answer (bots.ts translates and fills the `{name}`, `{me}` and `{level}` blanks). */
export function replyTo(text: string, bot: BotDef, friend: boolean, deps: ChatDeps): string {
  const intent = intentOf(text), pool = CHAT_REPLIES[intent];
  if (friend && intent !== 'bye' && intent !== 'sad' && deps.rand() < .25) return deps.pick(bot.id + ':friend', FRIEND_EXTRA);
  return deps.pick(bot.id + ':' + intent, pool);
}
