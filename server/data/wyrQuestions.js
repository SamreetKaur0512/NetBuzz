// ─── Would You Rather Questions ───────────────────────────────────────────────
const wyrQuestions = [
  // Social Media / Tech
  { id: 1,  category: "Tech",     optionA: "Lose all your photos forever 📸",              optionB: "Lose all your contacts forever 📱" },
  { id: 2,  category: "Tech",     optionA: "Have 1M followers but no real friends 🌐",     optionB: "Have 10 true friends but no followers 👥" },
  { id: 3,  category: "Tech",     optionA: "Live without internet for a year 🚫📶",        optionB: "Live without AC/heating for a year 🥵" },
  { id: 4,  category: "Tech",     optionA: "Only use one app forever 📱",                  optionB: "Never use a smartphone again 🙅" },
  { id: 5,  category: "Tech",     optionA: "Have your search history public 🔍",           optionB: "Have your bank balance public 💳" },
  // Food
  { id: 6,  category: "Food",     optionA: "Eat only spicy food forever 🌶️",              optionB: "Eat only bland food forever 😐" },
  { id: 7,  category: "Food",     optionA: "Never eat pizza again 🍕",                     optionB: "Never eat ice cream again 🍦" },
  { id: 8,  category: "Food",     optionA: "Only drink water for the rest of your life 💧", optionB: "Never eat your favourite food again 😢" },
  { id: 9,  category: "Food",     optionA: "Eat the same meal every day 🍽️",              optionB: "Never eat the same meal twice 🔄" },
  { id: 10, category: "Food",     optionA: "Always be a little hungry 😐",                 optionB: "Always be a little too full 😮" },
  // Money / Life
  { id: 11, category: "Life",     optionA: "Be rich but very ugly 💰",                     optionB: "Be good-looking but always broke 😍" },
  { id: 12, category: "Life",     optionA: "Work your dream job for low salary 💫",        optionB: "Hate your job but earn very high salary 💸" },
  { id: 13, category: "Life",     optionA: "Be famous but unhappy 🌟",                     optionB: "Be unknown but very happy 😊" },
  { id: 14, category: "Life",     optionA: "Live 200 years in average health 👴",          optionB: "Live 60 years in perfect health 💪" },
  { id: 15, category: "Life",     optionA: "Know when you will die 📅",                    optionB: "Know how you will die ❓" },
  // Funny / Weird
  { id: 16, category: "Funny",    optionA: "Speak every language fluently 🌍",             optionB: "Play every instrument perfectly 🎸" },
  { id: 17, category: "Funny",    optionA: "Have no eyebrows 😶",                          optionB: "Have only one eyebrow 🤨" },
  { id: 18, category: "Funny",    optionA: "Fight 100 duck-sized horses 🦆",               optionB: "Fight 1 horse-sized duck 🦆💥" },
  { id: 19, category: "Funny",    optionA: "Always speak in rhymes 🎤",                    optionB: "Always speak in questions ❓" },
  { id: 20, category: "Funny",    optionA: "Have hands instead of feet 🤲",                optionB: "Have feet instead of hands 🦶" },
  // Superpowers
  { id: 21, category: "Powers",   optionA: "Be able to fly ✈️",                           optionB: "Be invisible 👻" },
  { id: 22, category: "Powers",   optionA: "Read minds 🧠",                                optionB: "See the future 🔮" },
  { id: 23, category: "Powers",   optionA: "Never need to sleep 😴",                       optionB: "Never need to eat 🍽️" },
  { id: 24, category: "Powers",   optionA: "Be super fast ⚡",                             optionB: "Be super strong 💪" },
  { id: 25, category: "Powers",   optionA: "Pause time ⏸️",                               optionB: "Rewind time ⏪" },
  // Bold / Scary
  { id: 26, category: "Bold",     optionA: "Always say what you think 😬",                 optionB: "Never speak your opinion again 🤐" },
  { id: 27, category: "Bold",     optionA: "Never sleep again 😵",                         optionB: "Never eat again 🙅🍽️" },
  { id: 28, category: "Bold",     optionA: "Forget all memories from childhood 👶",        optionB: "Forget everyone you know today 😢" },
  { id: 29, category: "Bold",     optionA: "Always be 10 minutes late ⏰",                 optionB: "Always be 1 hour early ⌚" },
  { id: 30, category: "Bold",     optionA: "Live in the past (1950s) 📺",                  optionB: "Live in the future (2150s) 🚀" },
  // Social
  { id: 31, category: "Social",   optionA: "Have no privacy but be loved by everyone ❤️", optionB: "Have full privacy but be ignored 😶" },
  { id: 32, category: "Social",   optionA: "Never use social media again 📵",              optionB: "Never watch movies/TV again 🎬" },
  { id: 33, category: "Social",   optionA: "Always know when someone is lying 🤥",         optionB: "Always get away with lying 😇" },
  { id: 34, category: "Social",   optionA: "Have no close friends but be popular 🌐",      optionB: "Have 3 best friends but no popularity 👫" },
  { id: 35, category: "Social",   optionA: "Be hated for doing good 😢",                   optionB: "Be loved for doing bad 😈" },
  // Fun extras
  { id: 36, category: "Fun",      optionA: "Live in a world with no music 🚫🎵",           optionB: "Live in a world with no colours 🚫🎨" },
  { id: 37, category: "Fun",      optionA: "Only wear one outfit forever 👕",              optionB: "Never wear the same outfit twice 👗" },
  { id: 38, category: "Fun",      optionA: "Win a gold medal at Olympics 🥇",              optionB: "Win a Nobel Prize 🏆" },
  { id: 39, category: "Fun",      optionA: "Be the best player on a losing team ⚽",       optionB: "Be the worst player on a winning team 🏆" },
  { id: 40, category: "Fun",      optionA: "Only be able to whisper 🤫",                   optionB: "Only be able to shout 📢" },
  { id: 41, category: "Fun",      optionA: "Have a rewind button for your life ⏪",        optionB: "Have a fast-forward button for your life ⏩" },
  { id: 42, category: "Fun",      optionA: "Be able to talk to animals 🐶",                optionB: "Be able to talk to plants 🌱" },
  { id: 43, category: "Fun",      optionA: "Always have the hiccups 😮",                   optionB: "Always feel like you need to sneeze 🤧" },
  { id: 44, category: "Fun",      optionA: "Relive your best day forever 😍",              optionB: "Have a new adventure every day 🌍" },
  { id: 45, category: "Fun",      optionA: "Have unlimited money but no time ⏳",          optionB: "Have unlimited time but no money 🕰️" },
  { id: 46, category: "Powers",   optionA: "Control fire 🔥",                              optionB: "Control water 🌊" },
  { id: 47, category: "Life",     optionA: "Always feel cold 🥶",                          optionB: "Always feel hot 🥵" },
  { id: 48, category: "Social",   optionA: "Know everyone's secrets 🤫",                   optionB: "Have everyone know your secrets 😳" },
  { id: 49, category: "Bold",     optionA: "Age only from the neck up 👴",                 optionB: "Age only from the neck down 👶" },
  { id: 50, category: "Funny",    optionA: "Laugh uncontrollably for 1 min every hour 😂", optionB: "Cry uncontrollably for 1 min every hour 😭" },
];

const getWyrQuestions = (count = 20) => {
  const shuffled = [...wyrQuestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};

module.exports = { wyrQuestions, getWyrQuestions };