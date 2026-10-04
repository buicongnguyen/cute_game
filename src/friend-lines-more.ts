/**
 * More for the helpers to say (merged into friend-lines.ts): kind words, a few gentle jokes and small thoughts about
 * inspiration and keeping going. Each is an [English, Vietnamese] pair so they stay in step.
 */
import type { LineScenario } from './friend-lines.ts';
export const MORE_LINES: Record<LineScenario, ReadonlyArray<readonly [string, string]>> = {
  HARVEST: [
    ['Every big harvest started as one tiny seed and a lot of patience.', 'Mỗi mùa bội thu đều bắt đầu từ một hạt giống bé xíu và thật nhiều kiên nhẫn.'],
    ['This is what happens when you do a little every day.', 'Đây là điều xảy ra khi mỗi ngày mình làm một chút.'],
    ['I think this one is smiling at me. Or it is just a bruise.', 'Mình nghĩ quả này đang cười với mình. Hoặc chỉ là vết thâm thôi.'],
    ['Look how far a seed can go. Makes me believe in myself.', 'Xem hạt giống đi được xa thế nào. Làm mình tin vào bản thân hơn.'],
    ['Harvest done! Time to dream up something even bigger.', 'Thu hoạch xong! Giờ mơ một điều còn to hơn nào.'],
    ['Plants do not rush, and they still get there. Wise, right?', 'Cây không vội mà vẫn tới đích. Thông thái chưa?'],
  ],
  PLANT: [
    ['Every garden is a little promise that tomorrow will be good.', 'Mỗi khu vườn là một lời hứa nhỏ rằng ngày mai sẽ tốt đẹp.'],
    ['Small seed, big dreams. We have a lot in common.', 'Hạt nhỏ, mơ ước lớn. Bọn mình giống nhau ghê.'],
    ['Go on, little seed. The sun believes in you.', 'Nào, hạt nhỏ. Mặt trời tin ở bạn đó.'],
    ['Planting is just hoping, with dirt on your hands.', 'Gieo trồng chính là hy vọng, với đôi tay lấm đất.'],
    ['I wonder what it will become. That is the fun part.', 'Không biết nó sẽ thành gì nhỉ. Chỗ vui nhất chính là đó.'],
    ['Do not worry, seed. I will not dig you up to check. Much.', 'Đừng lo, hạt ơi. Mình sẽ không đào lên xem đâu. Chắc vậy.'],
  ],
  COLLECT: [
    ['Look at all this. Hard work really does add up.', 'Nhìn bấy nhiêu này. Chăm chỉ đúng là cộng dồn thật.'],
    ['Collecting is the happiest chore. Nobody can argue.', 'Thu gom là việc nhà vui nhất. Ai cãi thì thôi.'],
    ['The animals did the hard part. I just say thank you.', 'Các bạn thú làm phần khó. Mình chỉ việc cảm ơn.'],
    ['One at a time, and suddenly the basket is full. Funny how that works.', 'Từng cái một, thế là giỏ đầy. Lạ thật.'],
    ['A good day starts with a little gratitude. Thank you, hens!', 'Một ngày tốt lành bắt đầu bằng chút biết ơn. Cảm ơn mấy bà gà!'],
    ['I was going to count them, but I got distracted by cuteness.', 'Mình định đếm, nhưng bị phân tâm vì dễ thương quá.'],
  ],
  FEED: [
    ['Eat well, grow strong, and keep your dreams big.', 'Ăn ngon, lớn khỏe, và cứ mơ thật lớn nhé.'],
    ['Nobody works well on an empty tummy. Not even me.', 'Chẳng ai làm việc tốt khi bụng đói. Mình cũng vậy.'],
    ['Slow down, there is plenty! Chew with your mouth closed. Please.', 'Từ từ thôi, còn nhiều mà! Nhai miệng khép lại nhé. Làm ơn.'],
    ['A little care every day makes everything flourish.', 'Một chút quan tâm mỗi ngày làm mọi thứ nở rộ.'],
    ['You are doing great, little one. Keep going.', 'Bạn giỏi lắm, bé ơi. Cứ tiếp tục nhé.'],
  ],
  COOK: [
    ['Cooking is just art you can eat. Beautiful, right?', 'Nấu ăn chỉ là nghệ thuật ăn được thôi. Đẹp chưa?'],
    ['A pinch of this, a pinch of that, and a lot of love.', 'Một nhúm này, một nhúm kia, và thật nhiều yêu thương.'],
    ['I got a new idea for a recipe. It might be brilliant. Or soup.', 'Mình có ý tưởng công thức mới. Có thể rất tuyệt. Hoặc thành món súp.'],
    ['Great meals begin with a little curiosity. What if we add cheese?', 'Bữa ngon bắt đầu từ chút tò mò. Thêm phô mai thì sao nhỉ?'],
    ['Mistakes make the best flavours. That is my excuse, anyway.', 'Lỡ tay lại ra vị ngon nhất. Dù sao đó là lý do của mình.'],
    ['Cooking for you makes my whole day feel meaningful.', 'Nấu ăn cho bạn làm cả ngày của mình thật ý nghĩa.'],
  ],
  NICE: [
    ['You inspire me every single day, boss.', 'Ngày nào bạn cũng truyền cảm hứng cho mình, sếp ạ.'],
    ['Because of you, this garden feels like a dream come true.', 'Nhờ có bạn, khu vườn này như giấc mơ thành sự thật.'],
    ['Boss, your kindness grows more than any crop.', 'Sếp ơi, lòng tốt của bạn lớn hơn mọi loại cây.'],
    ['I woke up with an idea, and then I forgot it. Classic me.', 'Mình tỉnh dậy với một ý tưởng, rồi quên mất. Đúng kiểu mình.'],
    ['Keep trying new things. That is how gardens, and people, bloom.', 'Cứ thử điều mới nhé. Vườn và con người đều nở hoa như vậy.'],
    ['You make hard work feel like play. How do you do that?', 'Bạn biến việc nặng thành trò chơi. Làm sao vậy?'],
    ['Whenever I feel small, I remember how big the trees get.', 'Mỗi khi thấy mình nhỏ bé, mình nhớ cây cũng lớn lên được.'],
    ['Thank you for believing in us. It means the world.', 'Cảm ơn vì đã tin tụi mình. Điều đó quý lắm.'],
    ['Be proud of today, boss. Small steps count too.', 'Hãy tự hào về hôm nay, sếp ạ. Bước nhỏ cũng tính.'],
    ['I have a great idea! It is a secret. I forgot what it is.', 'Mình có ý tưởng tuyệt lắm! Là bí mật. Mà mình quên mất rồi.'],
    ['Some days the best idea is a nap. I am only half joking.', 'Có hôm ý tưởng hay nhất là một giấc ngủ trưa. Mình chỉ đùa một nửa.'],
    ['You make this place feel like home. Thank you, boss.', 'Bạn làm nơi này như một mái nhà. Cảm ơn sếp.'],
  ],
  HOME: [
    ['Rest is part of the work. Even the soil needs a break.', 'Nghỉ ngơi cũng là một phần công việc. Đất cũng cần nghỉ mà.'],
    ['Good ideas love quiet moments. Time to find some.', 'Ý tưởng hay thích những lúc yên tĩnh. Đi tìm chút thôi.'],
    ['I will think about tomorrow by the fire. Big plans.', 'Mình sẽ nghĩ về ngày mai bên lò sưởi. Kế hoạch lớn đấy.'],
    ['A cup of tea and a good daydream. Perfect.', 'Một tách trà và một giấc mơ ngày. Hoàn hảo.'],
    ['I recharge indoors, like a very polite battery.', 'Mình sạc pin trong nhà, như một cục pin rất lịch sự.'],
    ['Home is where the best inspiration finds me.', 'Nhà là nơi cảm hứng hay nhất tìm đến mình.'],
  ],
  OUTFIT: [
    ['Dress for the day you want. Today I want to be fabulous.', 'Mặc cho ngày mình muốn. Hôm nay mình muốn thật lộng lẫy.'],
    ['A new look gives me new ideas. Funny how that works.', 'Diện mạo mới cho mình ý tưởng mới. Lạ thật.'],
    ['Confidence is the best accessory. And a nice hat.', 'Tự tin là phụ kiện đẹp nhất. Thêm cái mũ xinh nữa.'],
    ['Look at me! I can be anything. Today: a chef in style.', 'Nhìn mình nè! Mình có thể là bất cứ ai. Hôm nay: đầu bếp sành điệu.'],
    ['Every outfit is a little story. This one is a happy one.', 'Mỗi bộ đồ là một câu chuyện nhỏ. Bộ này vui lắm.'],
  ],
};
