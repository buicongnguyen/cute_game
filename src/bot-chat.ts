/**
 * Talking with an AI neighbour in the message box (bots.ts): the player's words are sorted into a few intents by keywords
 * (English or Vietnamese, accents ignored) and the neighbour answers from a pool for that intent. Replies are [English,
 * Vietnamese] pairs, dealt like cards so they rarely repeat; friends answer a little warmer than strangers.
 */
import type { BotDef } from './bot-logic.ts';

export type Intent = 'hello' | 'how' | 'thanks' | 'bye' | 'garden' | 'gift' | 'outfit' | 'fly' | 'friend' | 'joke' | 'praise' | 'name' | 'sad' | 'question' | 'other';
/** Lower-case, no accents (đ -> d), so "Xin chào" and "xin chao" match the same key. */
export const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\?/g, ' ? ').replace(/[^a-z0-9? ]+/g, ' ').replace(/\s+/g, ' ').trim();
const KEYS: Array<[Intent, string[]]> = [
  ['bye', ['bye', 'goodbye', 'see you', 'good night', 'tam biet', 'hen gap lai', 'ngu ngon', 'di day']],
  ['thanks', ['thank', 'thanks', 'cam on']],
  ['hello', ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'xin chao', 'chao', 'alo']],
  ['how', ['how are you', 'how r you', 'how do you do', 'what s up', 'khoe khong', 'khoe ko', 'the nao', 'dang lam gi', 'what are you doing']],
  ['gift', ['gift', 'present', 'give me', 'qua tang', 'tang qua', 'cho minh qua']],
  ['outfit', ['outfit', 'costume', 'clothes', 'wear', 'dress', 'hat', 'do dep', 'trang phuc', 'quan ao', 'bo do', 'mu']],
  ['fly', ['fly', 'flying', 'wings', 'sky', 'bay', 'canh']],
  ['friend', ['friend', 'be my', 'ban be', 'ket ban', 'lam ban']],
  ['garden', ['garden', 'farm', 'plant', 'crop', 'animal', 'vuon', 'trong', 'cay', 'nong trai', 'thu cung', 'gia suc']],
  ['joke', ['joke', 'funny', 'laugh', 'haha', 'lol', 'dua', 'hai huoc', 'cuoi']],
  ['praise', ['cool', 'awesome', 'great', 'nice', 'amazing', 'love', 'beautiful', 'tuyet', 'gioi', 'dep', 'thich', 'hay qua']],
  ['name', ['your name', 'who are you', 'ten gi', 'ten ban', 'ban la ai']],
  ['sad', ['sad', 'tired', 'lonely', 'bored', 'buon', 'met', 'chan', 'co don']],
];
export function intentOf(text: string): Intent {
  const s = ' ' + normalize(text) + ' ';
  for (const [intent, keys] of KEYS) if (keys.some(k => s.includes(' ' + k + ' ') || (k.length > 4 && s.includes(k)))) return intent;
  return s.includes(' ? ') ? 'question' : 'other';
}
const P = (en: string, vi: string) => [en, vi] as const;
export const CHAT_REPLIES: Record<Intent, ReadonlyArray<readonly [string, string]>> = {
  hello: [P('Hello, {name}! So nice to hear from you.', 'Chào {name}! Vui quá khi bạn nhắn cho mình.'), P('Hi hi! I was just thinking about the garden. And you!', 'Chào chào! Mình vừa nghĩ về khu vườn. Và cả bạn nữa!'), P('Hey {name}! What a lovely day to chat.', 'Này {name}! Hôm nay thật hợp để trò chuyện.'), P('Hello! You always make my day brighter.', 'Xin chào! Bạn luôn làm ngày của mình tươi sáng hơn.')],
  how: [P('I am wonderful, thank you! The sun is out and so are my ideas.', 'Mình khỏe lắm, cảm ơn bạn! Trời nắng và ý tưởng cũng nhiều.'), P('Pretty good! I walked all around the garden and met a butterfly.', 'Khá ổn! Mình đi dạo cả khu vườn và gặp một chú bướm.'), P('Doing great. How about you? Are you taking care of yourself?', 'Mình ổn lắm. Còn bạn thì sao? Bạn có chăm sóc bản thân không?'), P('Happy as a seed in spring. And you?', 'Vui như hạt giống mùa xuân. Còn bạn?')],
  thanks: [P('Anytime, {name}! That is what friends are for.', 'Không có gì đâu {name}! Bạn bè là để vậy mà.'), P('You are very welcome. It makes me happy too.', 'Không có chi. Mình cũng vui lắm.'), P('Aw, no need to thank me. You are the kind one!', 'Ôi, đừng cảm ơn mình. Bạn mới là người tốt bụng!')],
  bye: [P('Bye for now, {name}! Come back soon.', 'Tạm biệt nhé {name}! Sớm quay lại nha.'), P('See you! Say hi to your plants for me.', 'Hẹn gặp lại! Gửi lời chào đến mấy cái cây giúp mình nhé.'), P('Sweet dreams and good luck out there!', 'Chúc bạn ngủ ngon và may mắn nhé!')],
  garden: [P('Gardens are my favourite. Every plant is a tiny story.', 'Mình thích làm vườn nhất. Mỗi cây là một câu chuyện nhỏ.'), P('Mine has tomatoes, a goat and a very bossy goose. Visit me!', 'Vườn mình có cà chua, một chú dê và một bạn ngỗng rất hách dịch. Ghé chơi nhé!'), P('Water them a little every day and they will repay you with fruit.', 'Tưới một chút mỗi ngày, cây sẽ đền đáp bằng trái ngọt.'), P('Your garden is growing so well. I can tell you care.', 'Vườn của bạn lớn tốt lắm. Mình biết bạn chăm lắm.')],
  gift: [P('Friends do share nice things now and then. Keep meeting me!', 'Bạn bè thỉnh thoảng sẽ chia sẻ đồ hay cho nhau. Cứ gặp mình nhé!'), P('Gifts are better as a surprise. I will think of something!', 'Quà tặng bất ngờ mới vui. Mình sẽ nghĩ ra thứ gì đó!'), P('Patience, {name}. Good things come to friends who chat.', 'Kiên nhẫn nhé {name}. Điều tốt đến với những người bạn hay trò chuyện.')],
  outfit: [P('I love dressing up. Fashion is just confidence you can wear.', 'Mình mê diện đồ. Thời trang là sự tự tin mặc được lên người.'), P('Thanks! I picked this outfit after trying on everything.', 'Cảm ơn! Mình chọn bộ này sau khi thử hết tủ đồ.'), P('A good hat makes any day better. Trust me.', 'Một cái mũ đẹp làm ngày nào cũng vui hơn. Tin mình đi.')],
  fly: [P('Flying feels like a happy dream. The garden looks tiny from up there!', 'Bay giống như giấc mơ vui. Khu vườn nhìn từ trên cao bé xíu!'), P('I cannot fly myself, but I love watching the ones who can.', 'Mình không tự bay được, nhưng mình thích ngắm người biết bay.'), P('Wings or no wings, you can always reach for the sky.', 'Có cánh hay không, bạn vẫn luôn có thể vươn tới bầu trời.')],
  friend: [P('Friends are the best crop of all. They grow slowly and last forever.', 'Bạn bè là mùa màng tốt nhất. Lớn chậm mà bền mãi.'), P('I am glad we met, {name}. Truly.', 'Mình mừng vì đã gặp bạn, {name}. Thật đấy.'), P('A friend is someone who listens, like you do.', 'Bạn bè là người biết lắng nghe, như bạn vậy.')],
  joke: [P('Why did the carrot win? Because it was a root of all fun!', 'Tại sao cà rốt thắng cuộc? Vì nó là gốc rễ của mọi niềm vui!'), P('I tried to tell a farm joke, but it was too corny.', 'Mình kể chuyện cười nhà nông, nhưng nó sến quá.'), P('Haha! You made me snort like a little piglet.', 'Haha! Bạn làm mình khịt mũi như chú heo con.'), P('What do you call a sleeping goat? A nanny-nap! Okay, I will stop.', 'Con dê ngủ gọi là gì? Dê ngủ gật! Thôi mình dừng nhé.')],
  praise: [P('Aw, thank you! You are the cool one around here.', 'Ôi cảm ơn bạn! Bạn mới là người tuyệt nhất ở đây.'), P('You are too kind, {name}. My cheeks are blushing.', 'Bạn tốt bụng quá {name}. Mình đỏ mặt rồi.'), P('That is so sweet. Keep that kind spirit!', 'Ngọt ngào quá. Cứ giữ tinh thần tốt bụng ấy nhé!')],
  name: [P('I am {me}! Nice to meet you properly, {name}.', 'Mình là {me}! Rất vui được làm quen đàng hoàng, {name}.'), P('They call me {me}. Level {level}, and proud of it!', 'Mọi người gọi mình là {me}. Cấp {level}, và mình tự hào lắm!')],
  sad: [P('Oh no. Take a deep breath, {name}. Things get better, I promise.', 'Ôi không. Hít một hơi thật sâu nào {name}. Mọi chuyện sẽ ổn hơn, mình hứa.'), P('I am here for you. Maybe a walk in the garden will help?', 'Mình ở đây với bạn. Có lẽ đi dạo trong vườn sẽ giúp ích?'), P('Even the tallest tree started as a seed on a hard day. You will grow too.', 'Cây cao nhất cũng từng là hạt giống trong ngày khó khăn. Bạn cũng sẽ lớn thôi.')],
  question: [P('Hmm, good question. I will think about it while I walk.', 'Hmm, câu hỏi hay đấy. Mình sẽ nghĩ khi đi dạo.'), P('I am not sure, {name}. What do you think?', 'Mình không chắc, {name}. Bạn nghĩ sao?'), P('Ooh, interesting! Ask me again later, I might have an answer.', 'Ồ thú vị! Lát hỏi lại nhé, biết đâu mình có câu trả lời.')],
  other: [P('Tell me more, I like hearing from you.', 'Kể thêm đi, mình thích nghe bạn nói.'), P('That is nice, {name}. The valley is better with you in it.', 'Hay đó {name}. Thung lũng đẹp hơn nhờ có bạn.'), P('Hehe, I like the way you think.', 'Hehe, mình thích cách bạn nghĩ.'), P('Mm-hm! Go on, I am listening.', 'Ừm! Nói tiếp đi, mình đang nghe đây.'), P('You always have something interesting to say.', 'Bạn lúc nào cũng có điều thú vị để nói.')],
};
/** Lines only a friend says now and then, so a friendship feels warmer than a first hello. */
export const FRIEND_EXTRA: ReadonlyArray<readonly [string, string]> = [
  P('I am so happy we are friends, {name}.', 'Mình rất vui vì chúng ta là bạn, {name}.'),
  P('Come visit my garden any time. The door is always open.', 'Cứ ghé vườn mình bất cứ lúc nào. Cửa luôn mở.'),
  P('Meeting you is one of the best parts of my day.', 'Gặp bạn là một trong những điều tuyệt nhất của ngày mình.'),
];
export const CHAT_VI: Record<string, string> = Object.fromEntries([...Object.values(CHAT_REPLIES).flat(), ...FRIEND_EXTRA].map(([en, vi]) => [en, vi]));

export interface ChatDeps { pick: (key: string, pool: readonly string[]) => string; rand: () => number }
/** The English text of the neighbour's answer (bots.ts translates and fills the `{name}`, `{me}` and `{level}` blanks). */
export function replyTo(text: string, bot: BotDef, friend: boolean, deps: ChatDeps): string {
  const intent = intentOf(text), pool = CHAT_REPLIES[intent].map(p => p[0]);
  if (friend && intent !== 'bye' && intent !== 'sad' && deps.rand() < .25) return deps.pick(bot.id + ':friend', FRIEND_EXTRA.map(p => p[0]));
  return deps.pick(bot.id + ':' + intent, pool);
}
