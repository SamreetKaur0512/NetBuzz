// ─── Knowledge Quiz Questions ─────────────────────────────────────────────────
const quizQuestions = [
  // Science
  { id: 1, category: "Science", question: "What is the chemical symbol for water?", options: ["H2O", "CO2", "NaCl", "O2"], answer: 0, points: 10 },
  { id: 2, category: "Science", question: "How many bones are in the adult human body?", options: ["196", "206", "216", "186"], answer: 1, points: 10 },
  { id: 3, category: "Science", question: "What planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], answer: 2, points: 10 },
  { id: 4, category: "Science", question: "What is the speed of light (km/s)?", options: ["200,000", "299,792", "150,000", "400,000"], answer: 1, points: 10 },
  { id: 5, category: "Science", question: "Which element has the atomic number 1?", options: ["Helium", "Carbon", "Hydrogen", "Oxygen"], answer: 2, points: 10 },
  // History
  { id: 6, category: "History", question: "In which year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2, points: 10 },
  { id: 7, category: "History", question: "Who painted the Mona Lisa?", options: ["Michelangelo", "Raphael", "Leonardo da Vinci", "Donatello"], answer: 2, points: 10 },
  { id: 8, category: "History", question: "Which country first landed a man on the Moon?", options: ["USSR", "USA", "China", "UK"], answer: 1, points: 10 },
  { id: 9, category: "History", question: "The Great Wall of China was primarily built during which dynasty?", options: ["Tang", "Han", "Ming", "Qin"], answer: 2, points: 10 },
  { id: 10, category: "History", question: "Who was the first President of the United States?", options: ["Abraham Lincoln", "Thomas Jefferson", "George Washington", "John Adams"], answer: 2, points: 10 },
  // Geography
  { id: 11, category: "Geography", question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Brisbane"], answer: 2, points: 10 },
  { id: 12, category: "Geography", question: "Which is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3, points: 10 },
  { id: 13, category: "Geography", question: "Mount Everest is located in which mountain range?", options: ["Andes", "Alps", "Himalayas", "Rockies"], answer: 2, points: 10 },
  { id: 14, category: "Geography", question: "Which country has the most natural lakes?", options: ["Russia", "Canada", "USA", "Brazil"], answer: 1, points: 10 },
  { id: 15, category: "Geography", question: "What is the longest river in the world?", options: ["Amazon", "Yangtze", "Mississippi", "Nile"], answer: 3, points: 10 },
  // Technology
  { id: 16, category: "Technology", question: "Who co-founded Apple Inc.?", options: ["Bill Gates", "Steve Jobs", "Mark Zuckerberg", "Elon Musk"], answer: 1, points: 10 },
  { id: 17, category: "Technology", question: "What does 'HTML' stand for?", options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Mode Link", "Home Tool Markup Language"], answer: 0, points: 10 },
  { id: 18, category: "Technology", question: "Which company created the Java programming language?", options: ["Microsoft", "Apple", "Sun Microsystems", "IBM"], answer: 2, points: 10 },
  { id: 19, category: "Technology", question: "What does 'CPU' stand for?", options: ["Central Processing Unit", "Computer Power Unit", "Core Processing Utility", "Central Program Unit"], answer: 0, points: 10 },
  { id: 20, category: "Technology", question: "Who invented the World Wide Web?", options: ["Bill Gates", "Tim Berners-Lee", "Vint Cerf", "Steve Jobs"], answer: 1, points: 10 },
];

// ─── Mind Puzzle Challenges ───────────────────────────────────────────────────
const puzzleQuestions = [
  { id: 1, category: "Logic", question: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?", options: ["A dream", "A map", "A painting", "A mirror"], answer: 1, points: 15 },
  { id: 2, category: "Math", question: "If 2+2=4 and 3+3=9 in this pattern, what is 4+4?", options: ["8", "12", "16", "20"], answer: 2, points: 15 },
  { id: 3, category: "Logic", question: "The more you take, the more you leave behind. What am I?", options: ["Time", "Footsteps", "Memories", "Breaths"], answer: 1, points: 15 },
  { id: 4, category: "Sequence", question: "What comes next: 2, 6, 12, 20, 30, ?", options: ["40", "42", "44", "46"], answer: 1, points: 15 },
  { id: 5, category: "Logic", question: "A rooster lays an egg on top of a barn. Which way does it roll?", options: ["Left", "Right", "Forward", "Roosters don't lay eggs"], answer: 3, points: 15 },
  { id: 6, category: "Math", question: "If a doctor gives you 3 pills and says take one every half hour, how long before they're gone?", options: ["90 minutes", "60 minutes", "45 minutes", "30 minutes"], answer: 1, points: 15 },
  { id: 7, category: "Sequence", question: "What number replaces the '?': 1, 1, 2, 3, 5, 8, ?", options: ["11", "12", "13", "14"], answer: 2, points: 15 },
  { id: 8, category: "Logic", question: "You see a boat filled with people, yet there isn't a single person on board. How?", options: ["They are robots", "They are all married", "They are all ghosts", "They are all twins"], answer: 1, points: 15 },
  { id: 9, category: "Math", question: "What is 15% of 200?", options: ["20", "25", "30", "35"], answer: 2, points: 15 },
  { id: 10, category: "Logic", question: "I speak without a mouth and hear without ears. I have no body but come alive with wind. What am I?", options: ["A shadow", "An echo", "A tree", "A cloud"], answer: 1, points: 15 },
  { id: 11, category: "Sequence", question: "Complete the pattern: J, F, M, A, M, J, J, ?", options: ["S", "A", "O", "N"], answer: 1, points: 15 },
  { id: 12, category: "Math", question: "A bat and ball cost $1.10 together. The bat costs $1 more than the ball. How much does the ball cost?", options: ["$0.10", "$0.05", "$0.15", "$0.20"], answer: 1, points: 15 },
  { id: 13, category: "Logic", question: "What has hands but can't clap?", options: ["A statue", "A clock", "A robot", "A glove"], answer: 1, points: 15 },
  { id: 14, category: "Sequence", question: "What comes next: 1, 4, 9, 16, 25, ?", options: ["30", "35", "36", "49"], answer: 2, points: 15 },
  { id: 15, category: "Logic", question: "The more you dry me, the wetter I get. What am I?", options: ["Sand", "A towel", "Hair", "A sponge"], answer: 1, points: 15 },
];

/**
 * Returns `count` randomly shuffled questions for the given game type.
 * @param {"quiz"|"puzzle"} gameType
 * @param {number} count
 */
function getRandomQuestions(gameType, count = 10) {
  const pool = gameType === "quiz" ? quizQuestions : puzzleQuestions;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

module.exports = { getRandomQuestions };
