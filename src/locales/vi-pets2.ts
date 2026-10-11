// Vietnamese for the second pet slot and the guard dog as a pet (pet-slots.ts, the bag in main.ts).
// PETS2_ITEMS_VI is item text (merged into VI_CATALOG like the dye names: tests/catalog-locale.test.ts wants every item's
// name and description there; the dog pet's name 'Garden guard dog' is the pen animal's, already in the catalog).
export const PETS2_ITEMS_VI: Record<string, string> = {
  'Your guard dog. Bring it along and it tosses bones at creatures; left at home it rests by its pen. It guards your garden either way.': 'Chó canh vườn của bạn. Mang theo thì nó ném xương vào quái vật; để ở nhà thì nó nghỉ bên chuồng. Dù thế nào nó vẫn canh vườn cho bạn.',
};
/** Interface strings (merged into VI_PACK by vi-pack.ts). */
export const PETS2_VI: Record<string, string> = {
  'Second pet': 'Thú cưng thứ hai',
  'Replace {name}': 'Thay {name}',
  'Leave at home': 'Để ở nhà',
  'Your guard dog comes along as a pet. Leave it at home from your backpack.': 'Chó canh vườn đi theo bạn như một thú cưng. Muốn để nó ở nhà, hãy tháo ra trong ba lô.',
  'Your guard dog waits at its pen. Bring it along from your backpack.': 'Chó canh vườn đợi ở chuồng. Muốn mang nó theo, hãy trang bị trong ba lô.',
  'Your guard dog stays with you.': 'Chó canh vườn luôn ở bên bạn.',
};
