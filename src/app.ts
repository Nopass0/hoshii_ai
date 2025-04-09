import { z } from "zod";
import { generateText, generateStructured, type AIMessage } from "@/ai";

// Интерфейсы для инвентаря и предметов
interface Item {
  id: string;
  name: string;
  description: string;
  type: "weapon" | "armor" | "potion" | "key" | "misc";
  properties?: {
    damage?: number;
    defense?: number;
    healing?: number;
    effects?: string[];
  };
  quantity: number;
}

// Интерфейс для NPC (персонажей и существ)
interface NPC {
  id: string;
  name: string;
  type: "human" | "animal" | "monster" | "other";
  age?: number;
  gender?: "male" | "female" | "unknown" | "other";
  description: string;
  personality: string;
  background: string;
  intentions: string;
  inventory?: Item[];
  health?: number;
  maxHealth?: number;
  isHostile: boolean;
}

// Интерфейс для погодных условий
interface Weather {
  current: string; // Например: "солнечно", "дождливо", "снег", и т.д.
  temperature: number; // Температура в Цельсиях
  effects: string[]; // Эффекты погоды на игровой процесс
}

// Интерфейс для времени
interface GameTime {
  minute: number;
  hour: number;
  day: number;
  month: number;
  year: number;
  dayTime: "утро" | "день" | "вечер" | "ночь";
  totalMinutes: number; // Общее количество игровых минут, прошедших с начала игры
}

// Интерфейс для состояния героя
interface Player {
  name: string;
  gender: string;
  age: number;
  background: string;
  health: number;
  maxHealth: number;
  inventory: Item[];
  abilities: string[];
  gold: number;
}

// Интерфейс для игрового мира
interface GameWorld {
  name: string;
  description: string;
  rules: string;
  setting: string;
  mainStoryline: string;
}

// Расширенный интерфейс для игрового состояния
interface GameState {
  scene: string;
  location: {
    name: string;
    description: string;
    terrain: string;
  };
  weather: Weather;
  time: GameTime;
  player: Player;
  world: GameWorld;
  npcsPresent: NPC[];
  options: Array<{
    id: string;
    text: string;
    consequence: string;
    timeChange?: number; // Минуты, которые пройдут при выборе этого варианта
    goldChange?: number; // Изменение количества золота: положительное - получение, отрицательное - трата
  }>;
}

// Схема валидации для структурированного ответа
const GameStateSchema = z.object({
  scene: z.string(),
  location: z.object({
    name: z.string(),
    description: z.string(),
    terrain: z.string()
  }).optional(), // Опционально для обратной совместимости
  weather: z.object({
    current: z.string(),
    temperature: z.number(),
    effects: z.array(z.string())
  }).optional(),
  time: z.object({
    minute: z.number(),
    hour: z.number(),
    day: z.number(),
    month: z.number(),
    year: z.number(),
    dayTime: z.enum(['\u0443\u0442\u0440\u043e', '\u0434\u0435\u043d\u044c', '\u0432\u0435\u0447\u0435\u0440', '\u043d\u043e\u0447\u044c']),
    totalMinutes: z.number()
  }).optional(),
  player: z.object({
    name: z.string(),
    gender: z.string(),
    age: z.number(),
    background: z.string(),
    health: z.number(),
    maxHealth: z.number(),
    inventory: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      type: z.enum(['weapon', 'armor', 'potion', 'key', 'misc']),
      properties: z.object({
        damage: z.number().optional(),
        defense: z.number().optional(),
        healing: z.number().optional(),
        effects: z.array(z.string()).optional()
      }).optional(),
      quantity: z.number()
    })),
    abilities: z.array(z.string()),
    gold: z.number()
  }).optional(),
  world: z.object({
    name: z.string(),
    description: z.string(),
    rules: z.string(),
    setting: z.string(),
    mainStoryline: z.string()
  }).optional(),
  npcsPresent: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['human', 'animal', 'monster', 'other']),
    age: z.number().optional(),
    gender: z.enum(['male', 'female', 'unknown', 'other']).optional(),
    description: z.string(),
    personality: z.string(),
    background: z.string(),
    intentions: z.string(),
    inventory: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      type: z.enum(['weapon', 'armor', 'potion', 'key', 'misc']),
      properties: z.object({
        damage: z.number().optional(),
        defense: z.number().optional(),
        healing: z.number().optional(),
        effects: z.array(z.string()).optional()
      }).optional(),
      quantity: z.number()
    })).optional(),
    health: z.number().optional(),
    maxHealth: z.number().optional(),
    isHostile: z.boolean()
  })).optional(),
  options: z.array(z.object({
    id: z.string(),
    text: z.string(),
    consequence: z.string(),
    timeChange: z.number().optional(),
    goldChange: z.number().optional()
  }))
});

type GameHistory = Array<{
  role: "user" | "assistant" | "system";
  content: string;
}>;

// Начальная настройка игрового мира
const gameWorld: GameWorld = {
  name: "Эльдерхейм",
  description: "Мир магии и древних легенд, где технологии соседствуют с волшебством, а древние расы борются за власть и выживание.",
  rules: "Мир работает по законам низкого фэнтези. Магия существует, но редка. Существуют люди, эльфы, гномы и орки. Смерть персонажа окончательна. Выборы влияют на мир.",
  setting: "Мир находится на грани войны. Империя людей расширяется, эльфийские королевства слабеют, подземные гномы накапливают богатства, а орки объединяются под новым лидером.",
  mainStoryline: "Герой должен найти древний артефакт, способный предотвратить грядущую войну между расами и остановить древнее зло, пробуждающееся из-за растущего конфликта."
};

// Начальное время
const initialTime: GameTime = {
  minute: 0,
  hour: 9, // Начало в 9 утра
  day: 1,
  month: 5, // Весна
  year: 1247, // Год от основания Империи
  dayTime: "утро",
  totalMinutes: 0
};

// Начальная погода
const initialWeather: Weather = {
  current: "солнечно",
  temperature: 18,
  effects: ["хорошая видимость", "сухая земля", "лёгкий ветер"]
};

// Начальный игрок
const initialPlayer: Player = {
  name: "Альтаир",
  gender: "мужской",
  age: 27,
  background: "Бывший солдат имперской армии, покинувший службу после того, как увидел сон о древнем артефакте.",
  health: 100,
  maxHealth: 100,
  inventory: [
    {
      id: "sword",
      name: "Стальной меч",
      description: "Надёжный имперский меч, служивший вам много лет.",
      type: "weapon",
      properties: { damage: 10 },
      quantity: 1
    },
    {
      id: "healing_potion",
      name: "Зелье лечения",
      description: "Маленький флакон с красной жидкостью, заживляющей раны.",
      type: "potion",
      properties: { healing: 25 },
      quantity: 2
    },
    {
      id: "map",
      name: "Карта региона",
      description: "Потрёпанная карта окрестностей города Новомир.",
      type: "misc",
      quantity: 1
    }
  ],
  abilities: ["владение мечом", "выносливость", "выживание"],
  gold: 15
};

// Флаг для отслеживания завершения игры
let isGameOver = false;

// Функция для обновления времени в игре
async function updateGameTime(state: GameState, minutesToAdd: number): Promise<void> {
  if (!state.time) return;
  
  state.time.totalMinutes += minutesToAdd;
  
  // Обновляем минуты и часы
  state.time.minute += minutesToAdd;
  while (state.time.minute >= 60) {
    state.time.minute -= 60;
    state.time.hour += 1;
  }
  
  // Обновляем день если нужно
  while (state.time.hour >= 24) {
    state.time.hour -= 24;
    state.time.day += 1;
  }
  
  // Обновляем месяц если нужно (упрощенно - 30 дней в месяце)
  while (state.time.day > 30) {
    state.time.day -= 30;
    state.time.month += 1;
  }
  
  // Обновляем год если нужно (12 месяцев в году)
  while (state.time.month > 12) {
    state.time.month -= 12;
    state.time.year += 1;
  }
  
  // Обновляем время суток
  if (state.time.hour >= 5 && state.time.hour < 12) {
    state.time.dayTime = 'утро';
  } else if (state.time.hour >= 12 && state.time.hour < 18) {
    state.time.dayTime = 'день';
  } else if (state.time.hour >= 18 && state.time.hour < 22) {
    state.time.dayTime = 'вечер';
  } else {
    state.time.dayTime = 'ночь';
  }
}

// Вспомогательные функции
async function displayGameState(state: GameState) {
  // Отображаем заголовок с информацией
  console.log("\n" + "=".repeat(70));
  
  // Информация о локации, времени и дате
  const timeStr = `${state.time.hour.toString().padStart(2, '0')}:${state.time.minute.toString().padStart(2, '0')}`;
  console.log(`📍 ${state.location.name} | 🕒 ${timeStr} (${state.time.dayTime}) | 📅 День ${state.time.day}, Месяц ${state.time.month}, Год ${state.time.year}`);
  
  // Информация о погоде
  console.log(`🌤️ Погода: ${state.weather.current}, ${state.weather.temperature}°C`);
  
  // Информация о здоровье и золоте
  const healthPercent = (state.player.health / state.player.maxHealth) * 100;
  let healthEmoji = '❤️'; // Обычное сердце
  
  // Выбираем эмодзи в зависимости от уровня здоровья
  if (healthPercent <= 25) {
    healthEmoji = '💔'; // Сломанное сердце
  } else if (healthPercent <= 50) {
    healthEmoji = '🖤'; // Оранжевое сердце
  }
  
  console.log(`${healthEmoji} Здоровье: ${state.player.health}/${state.player.maxHealth} | 💰 Золото: ${state.player.gold}`);
  console.log("=".repeat(70));
  
  // Основное описание сцены
  console.log(`\n${state.scene}\n`);
  
  // Персонажи рядом, если есть
  if (state.npcsPresent && state.npcsPresent.length > 0) {
    console.log("🧑 Персонажи рядом:");
    state.npcsPresent.forEach(npc => {
      // Выбираем эмодзи в зависимости от типа NPC
      let npcEmoji = '🚹'; // Человек по умолчанию
      if (npc.type === 'animal') {
        npcEmoji = '🐾'; // Животное
      } else if (npc.type === 'monster') {
        npcEmoji = '👾'; // Монстр
      } else if (npc.type === 'other') {
        npcEmoji = '👻'; // Призрак/другое
      }
      
      // Отображаем информацию о NPC
      console.log(`  ${npcEmoji} ${npc.name}: ${npc.description} ${npc.isHostile ? '🔥 (Враждебен)' : ''}`);
    });
    console.log("");
  }
  
  // Варианты действий
  console.log("Варианты действий:");
  state.options.forEach((option, index) => {
    // Собираем дополнительную информацию для отображения
    let additionalInfo = [];
    
    // Если есть информация о затраченном времени, показываем её
    if (option.timeChange) {
      additionalInfo.push(`⏱️ ${option.timeChange} мин`);
    }
    
    // Показываем информацию о золоте, если она есть
    if (option.goldChange) {
      if (option.goldChange > 0) {
        additionalInfo.push(`💰 +${option.goldChange} золота`);
      } else if (option.goldChange < 0) {
        additionalInfo.push(`💰 ${option.goldChange} золота`);
      }
    } else if (option.text.toLowerCase().includes('купить') || 
              option.text.toLowerCase().includes('приобрести') || 
              option.text.toLowerCase().includes('заплатить')) {
      // Если в тексте есть слово о покупке, но нет точной суммы
      additionalInfo.push('💰 Требует золота');
    } else if (option.text.toLowerCase().includes('продать') || 
               option.text.toLowerCase().includes('награда') || 
               option.text.toLowerCase().includes('оплата')) {
      // Если в тексте есть упоминание о продаже/награде
      additionalInfo.push('💰 Можно получить золото');
    }
    
    // Форматируем и выводим опцию
    const infoString = additionalInfo.length > 0 ? `[${additionalInfo.join(', ')}]` : '';
    console.log(`${index + 1}. ${option.text} ${infoString}`);
  });
  
  // Добавляем возможность открыть инвентарь
  console.log(`${state.options.length + 1}. 🎒 Открыть инвентарь`);
}

// Функция для работы с инвентарём
async function showInventory(player: Player) {
  console.log("\n🎒 Инвентарь:\n");
  
  if (player.inventory.length === 0) {
    console.log("  Инвентарь пуст.\n");
    return;
  }
  
  // Показываем список предметов
  player.inventory.forEach((item, index) => {
    // Выбираем эмодзи в зависимости от типа предмета
    let itemEmoji = '📜'; // свиток по умолчанию
    if (item.type === 'weapon') {
      itemEmoji = '⚔️';
    } else if (item.type === 'armor') {
      itemEmoji = '🛡️';
    } else if (item.type === 'potion') {
      itemEmoji = '🧉';
    } else if (item.type === 'key') {
      itemEmoji = '🗝️';
    }
    
    const quantity = item.quantity > 1 ? `(${item.quantity})` : '';
    console.log(`  ${index + 1}. ${itemEmoji} ${item.name} ${quantity}`);
  });
  
  console.log("\nВыберите предмет для подробной информации или действия, или 0 для выхода:");
  
  const response = await askQuestion("Выбор: ");
  const itemIndex = parseInt(response) - 1;
  
  if (itemIndex === -1 || isNaN(itemIndex) || response === '0') {
    return; // Выход из инвентаря
  }
  
  if (itemIndex >= 0 && itemIndex < player.inventory.length) {
    const item = player.inventory[itemIndex];
    
    // Показываем подробности о предмете
    console.log(`\nПодробно о предмете '${item.name}':\n`);
    console.log(`Описание: ${item.description}`);
    
    // Показываем свойства предмета, если они есть
    if (item.properties) {
      if (item.properties.damage) {
        console.log(`Урон: ${item.properties.damage}`);
      }
      if (item.properties.defense) {
        console.log(`Защита: ${item.properties.defense}`);
      }
      if (item.properties.healing) {
        console.log(`Лечение: ${item.properties.healing}`);
      }
      if (item.properties.effects && item.properties.effects.length > 0) {
        console.log(`Эффекты: ${item.properties.effects.join(', ')}`);
      }
    }
    
    // Предлагаем действия с предметом
    console.log("\nДействия:");
    console.log("1. Использовать");
    console.log("2. Выбросить");
    console.log("0. Назад");
    
    const action = await askQuestion("Выбор: ");
    
    if (action === '1') {
      // Используем предмет
      console.log(`Вы используете ${item.name}.`);
      
      // Обрабатываем разные типы предметов
      if (item.type === 'potion' && item.properties?.healing) {
        const healAmount = item.properties.healing;
        player.health = Math.min(player.health + healAmount, player.maxHealth);
        console.log(`Вы выпили зелье и восстановили ${healAmount} здоровья!`);
        
        // Уменьшаем количество предмета или удаляем его
        item.quantity--;
        if (item.quantity <= 0) {
          player.inventory.splice(itemIndex, 1);
        }
      }
      // Другие типы предметов можно обработать аналогично
    } else if (action === '2') {
      // Выбрасываем предмет
      const confirmDrop = await askQuestion(`Вы уверены, что хотите выбросить ${item.name}? (да/нет): `);
      
      if (confirmDrop.toLowerCase() === 'да') {
        player.inventory.splice(itemIndex, 1);
        console.log(`Вы выбросили ${item.name}.`);
      }
    }
    
    // Показываем инвентарь снова
    await showInventory(player);
  } else {
    console.log("Неверный выбор, попробуйте еще раз.");
    await showInventory(player);
  }
}

async function askQuestion(question: string): Promise<string> {
  console.log(question);
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim());
    });
  });
}

// Основная функция игры
async function startDndGame() {
  console.log("🎲 Добро пожаловать в мини D&D приключение! 🏰");

  // Создаем начальную локацию
  const initialLocation = {
    name: "Город Новомир",
    description: "Большой торговый город на пересечении древних торговых путей",
    terrain: "городская местность"
  };
  
  // Создаем историю игры
  const gameHistory: GameHistory = [];
  
  // Начальная сцена
  const startPrompt = `
Создай начальную сцену для фэнтези приключения в мире ${gameWorld.name}.

Описание мира: ${gameWorld.description}
Правила: ${gameWorld.rules}
Сеттинг: ${gameWorld.setting}
Основной сюжет: ${gameWorld.mainStoryline}

Главный герой: ${initialPlayer.name}, ${initialPlayer.gender}, ${initialPlayer.age} лет. ${initialPlayer.background}

Текущая локация: ${initialLocation.name}, ${initialLocation.description}
Погода: ${initialWeather.current}, ${initialWeather.temperature}°C
Время: ${initialTime.hour}:${initialTime.minute.toString().padStart(2, '0')}, ${initialTime.dayTime}, День ${initialTime.day}, Месяц ${initialTime.month}, Год ${initialTime.year}

Опиши подробную сцену и предложи 3-4 варианта действий. Для каждого действия укажи, сколько времени (в минутах) оно займет (от 5 до 100 минут).
Могут ли встретиться новые персонажи? Если да, опиши их подробно (личность, намерения, предыстория).
`;

  let gameState: GameState;
  
  try {
    gameState = await generateStructured<GameState>(
      startPrompt,
      {
        schema: GameStateSchema,
        jsonSchema: {
          name: "GameState",
          description: "Расширенное состояние игры для D&D приключения",
          schema: {
            type: "object",
            properties: {
              scene: { type: "string", description: "Описание текущей сцены и окружения" },
              location: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Название локации" },
                  description: { type: "string", description: "Описание локации" },
                  terrain: { type: "string", description: "Тип местности" }
                },
                required: ["name", "description", "terrain"]
              },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Уникальный идентификатор варианта" },
                    text: { type: "string", description: "Текст варианта действия" },
                    consequence: { type: "string", description: "Описание следствия выбора" },
                    timeChange: { type: "integer", description: "Время в минутах, которое займет действие (5-100)" }
                  },
                  required: ["id", "text", "consequence"]
                }
              }
            },
            required: ["scene", "options"]
          }
        }
      }
    );
      
    // Добавляем недостающие поля, если их нет
    if (!gameState.location) {
      gameState.location = initialLocation;
    }
    if (!gameState.weather) {
      gameState.weather = initialWeather;
    }
    if (!gameState.time) {
      gameState.time = initialTime;
    }
    if (!gameState.player) {
      gameState.player = initialPlayer;
    }
    if (!gameState.world) {
      gameState.world = gameWorld;
    }
    if (!gameState.npcsPresent) {
      gameState.npcsPresent = [];
    }
      
    // Проверяем здоровье игрока
    if (gameState.player.health <= 0) {
      console.log("\n" + "=".repeat(70));
      console.log("Ваш персонаж погиб. Игра окончена.");
      console.log("=".repeat(70) + "\n");
      isGameOver = true;
      return;
    }
  } catch (error) {
    console.error("\nОшибка при генерации начальной сцены:", error);
    return;
  }

  // Показываем начальную сцену
  await displayGameState(gameState);

  // Основной игровой цикл
  while (!isGameOver) {
    try {
      // Запрашиваем выбор у игрока
      const input = await askQuestion("Ваш выбор (введите номер): ");
      const choiceNum = parseInt(input);
      
      if (isNaN(choiceNum)) {
        console.log("Неверный ввод. Пожалуйста, введите число.");
        continue;
      }
      
      // Проверяем, выбрал ли игрок действие или инвентарь
      if (choiceNum === gameState.options.length + 1) {
        // Открыть инвентарь
        await showInventory(gameState.player);
        continue;
      }
      
      if (choiceNum < 1 || choiceNum > gameState.options.length) {
        console.log(`Пожалуйста, выберите число от 1 до ${gameState.options.length + 1}.`);
        continue;
      }
      
      const choice = gameState.options[choiceNum - 1];
      
      // Добавляем выбор в историю
      gameHistory.push({ role: "user", content: choice.text });
      
      // Обновляем время в игре, если действие занимает время
      if (choice.timeChange) {
        await updateGameTime(gameState, choice.timeChange);
      } else {
        // Если время не указано, по умолчанию 5 минут
        await updateGameTime(gameState, 5);
      }
      
      // Обрабатываем изменение золота, если оно указано
      if (choice.goldChange) {
        gameState.player.gold += choice.goldChange;
        if (choice.goldChange > 0) {
          console.log(`Вы получили ${choice.goldChange} золота.`);
        } else if (choice.goldChange < 0) {
          console.log(`Вы потратили ${Math.abs(choice.goldChange)} золота.`);
        }
      }
      
      // Показываем результат выбора
      console.log("\n" + "-".repeat(70));
      console.log(`Вы выбрали: ${choice.text}`);
      console.log(choice.consequence);
      console.log("-".repeat(70) + "\n");
      
      // Добавляем результат выбора в историю
      gameHistory.push({ role: "assistant", content: choice.consequence });
      
      // Формируем промпт для следующей сцены
      const nextScenePrompt = `
Игрок выбрал: ${choice.text}
Последствия: ${choice.consequence}

Текущая локация: ${gameState.location.name}, ${gameState.location.description}
Текущее время: ${gameState.time.hour}:${gameState.time.minute.toString().padStart(2, '0')}, ${gameState.time.dayTime}, День ${gameState.time.day}, Месяц ${gameState.time.month}, Год ${gameState.time.year}
Погода: ${gameState.weather.current}, ${gameState.weather.temperature}°C
Золото игрока: ${gameState.player.gold} монет
Здоровье игрока: ${gameState.player.health}/${gameState.player.maxHealth}
Инвентарь: ${gameState.player.inventory.map(item => item.name).join(', ') || 'пусто'}

Создай новую сцену, описывающую что произошло после выбора игрока. Предложи 3-4 новых варианта действий с указанием времени, которое они займут (в минутах), и укажи изменение золота, если оно есть.

Требования:
1. В тексте сцены используй время ${gameState.time.hour}:${gameState.time.minute.toString().padStart(2, '0')}, а не другое.
2. Если действие подразумевает трату или получение золота, указывай это в параметре goldChange.
3. При необходимости измени локацию, добавь или удали NPC, обнови инвентарь или здоровье персонажа.
`;

      // Генерируем новую сцену
      console.log("Генерация следующей сцены...");
      
      try {
        const nextScene = await generateStructured<GameState>(
          nextScenePrompt,
          {
            schema: GameStateSchema,
            jsonSchema: {
              name: "GameState",
              description: "Расширенное состояние игры для D&D приключения",
              schema: {
                type: "object",
                properties: {
                  scene: { type: "string" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        text: { type: "string" },
                        consequence: { type: "string" },
                        timeChange: { type: "number" }
                      },
                      required: ["id", "text", "consequence"]
                    }
                  }
                },
                required: ["scene", "options"]
              }
            }
          }
        );
        
        // Добавляем недостающие поля, если их нет
        if (!nextScene.location) {
          nextScene.location = gameState.location;
        }
        if (!nextScene.weather) {
          nextScene.weather = gameState.weather;
        }
        if (!nextScene.time) {
          nextScene.time = gameState.time;
        }
        if (!nextScene.player) {
          nextScene.player = gameState.player;
        }
        if (!nextScene.world) {
          nextScene.world = gameState.world;
        }
        if (!nextScene.npcsPresent) {
          nextScene.npcsPresent = gameState.npcsPresent;
        }
        
        // Обновляем текущую сцену
        Object.assign(gameState, nextScene);
        
        // Проверяем здоровье игрока
        if (gameState.player.health <= 0) {
          console.log("\n" + "=".repeat(70));
          console.log("Ваш персонаж погиб. Игра окончена.");
          console.log("=".repeat(70) + "\n");
          isGameOver = true;
          break;
        }
        
        // Отображаем обновленную сцену
        await displayGameState(gameState);
      } catch (error) {
        console.error("\nОшибка при генерации следующей сцены:", error);
        console.log("Попробуем еще раз...");
      }
    } catch (error) {
      console.error("\nОшибка в игровом цикле:", error);
    }
  }
}

// Запускаем игру
startDndGame().catch(console.error);
