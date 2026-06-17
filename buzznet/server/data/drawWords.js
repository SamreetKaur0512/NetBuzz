const words = [
  // Animals
  "cat","dog","fish","bird","lion","tiger","elephant","giraffe","penguin","dolphin",
  "butterfly","snake","rabbit","monkey","horse","cow","pig","sheep","chicken","duck",
  "frog","turtle","crab","shark","whale","bear","wolf","fox","deer","zebra",
  // Food
  "pizza","burger","sushi","cake","apple","banana","strawberry","watermelon","ice cream",
  "sandwich","taco","pasta","cookie","donut","popcorn","coffee","juice","bread","egg","cheese",
  // Objects
  "chair","table","phone","laptop","book","pencil","umbrella","scissors","clock","key",
  "guitar","drum","piano","camera","bicycle","car","bus","airplane","boat","rocket",
  // Nature
  "sun","moon","star","cloud","rainbow","mountain","beach","tree","flower","leaf",
  "fire","water","snow","lightning","ocean","river","forest","desert","island","volcano",
  // Actions / Sports
  "swimming","running","dancing","sleeping","cooking","painting","reading","driving",
  "football","basketball","tennis","cricket","boxing","surfing","skiing","yoga",
  // Places
  "school","hospital","airport","library","museum","restaurant","park","mall","church","stadium",
  // Misc
  "crown","diamond","trophy","rocket","robot","ghost","witch","pirate","ninja","superhero",
  "bridge","castle","lighthouse","windmill","pyramid","igloo","tent","lantern","compass","anchor",
];

function getRandomWord() {
  return words[Math.floor(Math.random() * words.length)];
}

function getWordHint(word) {
  // Show first letter and blanks
  return word.split('').map((ch, i) => i === 0 ? ch : ch === ' ' ? ' ' : '_').join(' ');
}

module.exports = { words, getRandomWord, getWordHint };