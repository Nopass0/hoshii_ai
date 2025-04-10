import { z } from "zod";
import { generateText, generateStructured, type AIMessage } from "@/ai";
import type { Item, NPC, Weather, GameTime, Player, GameWorld, GameState, GameHistory } from "@/types";
import { gameWorld, initialTime, initialWeather, initialPlayer } from "@/game/initialData";
import { rollD20, formatInBox } from "@/utils";
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// --- Schemas ---

// Schema for basic game state updates
const GameStateSchema = z.object({
  scene: z.string().describe("Описание текущей сцены и происходящего."),
  location: z.object({
    name: z.string().describe("Название текущего места."),
    description: z.string().describe("Описание текущего места."),
    terrain: z.string().describe("Тип местности (лес, город, подземелье и т.д.).")
  }).optional().describe("Информация о текущей локации."),
  weather: z.object({
    current: z.string().describe("Текущие погодные условия (солнечно, дождь и т.д.)."),
    temperature: z.number().describe("Температура в градусах Цельсия."),
    effects: z.array(z.string()).describe("Игровые эффекты погоды (скользко, плохая видимость и т.д.).")
  }).optional().describe("Информация о погоде."),
  time: z.object({
    minute: z.number(),
    hour: z.number(),
    day: z.number(),
    month: z.number(),
    year: z.number(),
    dayTime: z.enum(['утро', 'день', 'вечер', 'ночь']),
    totalMinutes: z.number()
  }).optional().describe("Текущее игровое время."),
  player: z.object({
    name: z.string(),
    gender: z.string(),
    age: z.number(),
    background: z.string(),
    health: z.number().describe("Текущее здоровье игрока."),
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
    })).describe("Предметы в инвентаре игрока."),
    abilities: z.array(z.string()),
    gold: z.number().describe("Количество золота у игрока.")
  }).optional().describe("Информация об игроке."),
  world: z.object({
    name: z.string(),
    description: z.string(),
    rules: z.string(),
    setting: z.string(),
    mainStoryline: z.string()
  }).optional().describe("Общая информация об игровом мире."),
  npcsPresent: z.array(z.object({
    id: z.string().describe("Уникальный ID NPC."),
    name: z.string().describe("Имя NPC."),
    type: z.enum(['human', 'animal', 'monster', 'other']).describe("Тип NPC."),
    age: z.number().optional().describe("Возраст NPC."),
    gender: z.enum(['male', 'female', 'unknown', 'other']).optional().describe("Пол NPC."),
    description: z.string().describe("Внешнее описание NPC."),
    personality: z.string().describe("Черты характера NPC."),
    background: z.string().describe("Предыстория NPC."),
    intentions: z.string().describe("Начальные намерения или цели NPC."),
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
    })).optional().describe("Инвентарь NPC."),
    health: z.number().optional(),
    maxHealth: z.number().optional(),
    isHostile: z.boolean().describe("Враждебен ли NPC к игроку.")
  })).optional().describe("NPC, находящиеся в текущей локации."),
  options: z.array(z.object({
    id: z.string().describe("Уникальный идентификатор варианта."),
    text: z.string().describe("Текст варианта действия для игрока."),
    consequence: z.string().optional().describe("Краткое описание последствий для информации."),
    timeChange: z.number().optional().describe("Изменение времени в минутах."),
    goldChange: z.number().optional().describe("Изменение золота.")
  })).describe("Варианты действий, доступные игроку.")
});

// Schema for initial world and NPC generation
const WorldGenerationSchema = z.object({
  world: z.object({
    name: z.string().describe("Название игрового мира."),
    description: z.string().describe("Краткое общее описание мира."),
    setting: z.string().describe("Описание сеттинга, атмосферы, ключевых мест или фракций."),
    history: z.string().describe("Краткая история мира, важные события прошлого."),
    mainStoryline: z.string().describe("Основной каркас сюжета, главная цель или конфликт.")
  }).describe("Детали сгенерированного игрового мира."),
  initialNpcs: z.array(z.object({
    id: z.string().uuid().describe("Уникальный ID NPC в формате UUID."),
    name: z.string().describe("Имя NPC."),
    type: z.enum(['human', 'animal', 'monster', 'other']).describe("Тип NPC."),
    age: z.number().optional().describe("Возраст NPC (если применимо)."),
    gender: z.enum(['male', 'female', 'unknown', 'other']).optional().describe("Пол NPC (если применимо)."),
    description: z.string().describe("Внешнее описание NPC."),
    personality: z.string().describe("Основные черты характера NPC."),
    background: z.string().describe("Краткая предыстория NPC."),
    intentions: z.string().describe("Начальные намерения или цели NPC в данной сцене/игре."),
    isHostile: z.boolean().default(false).describe("Враждебен ли NPC к игроку по умолчанию.")
    // Начальный инвентарь можно добавить позже или генерировать отдельно
  })).min(3).describe("Список из как минимум 3 ключевых стартовых NPC.")
});

// --- Globals ---

let isGameOver = false;
const history: AIMessage[] = [];
const rl = readline.createInterface({ input, output });

// --- Functions ---

// Function to generate the initial world details and starting NPCs
async function generateInitialWorldAndNPCs(): Promise<{ world: GameWorld; npcs: NPC[] }> {
  console.log("⏳ Генерация мира и персонажей с помощью AI...");
  // Modified Prompt with even stricter instructions:
  const prompt = `Создай уникальный фэнтезийный мир для текстовой RPG. Включи название, краткое описание, сеттинг (атмосфера, ключевые места/фракции), краткую историю и основной сюжетный каркас. Также создай как минимум 3 уникальных стартовых NPC с именем, типом (human, animal, monster, other), описанием внешности, характером, предысторией и начальными намерениями. Задай каждому NPC уникальный UUID в поле id. По умолчанию isHostile = false. Формат ответа должен соответствовать JSON schema WorldGenerationSchema.\n\nКРАЙНЕ ВАЖНО: Следуй этим правилам НЕУКОСНИТЕЛЬНО:\n1.  ВСЕ поля, описанные в схеме, являются ОБЯЗАТЕЛЬНЫМИ, если явно не помечены как 'optional'. Поле 'world.mainStoryline' ОБЯЗАТЕЛЬНО должно присутствовать и содержать строку.\n2.  Поля 'world.setting' и 'world.history' должны быть простыми СТРОКАМИ текста, а не объектами.\n3.  Поле 'initialNpcs' ДОЛЖНО содержать массив из как минимум 3 объектов NPC.\n4.  Для КАЖДОГО NPC ОБЯЗАТЕЛЬНО должны быть указаны ВСЕ требуемые поля: 'id' (СТРОГО в формате UUID), 'name', 'type', 'description', 'personality', 'background', 'intentions', 'isHostile'. Убедись, что КАЖДЫЙ NPC в массиве 'initialNpcs' имеет поле 'id' в СТРОГОМ формате UUID (например, 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').\n5.  Поле 'type' для NPC может принимать ТОЛЬКО ОДНО из следующих значений: 'human', 'animal', 'monster', 'other'. НЕ ИСПОЛЬЗУЙ другие типы, такие как 'elf', 'dwarf', 'orc' и т.д.`;

  try {
    const generatedData = await generateStructured(prompt, {
      schema: WorldGenerationSchema,
      history: [], // No history for initial generation
      jsonSchema: {
        name: "WorldGeneration",
        description: "Генерация начальных данных мира и NPC для RPG",
        schema: WorldGenerationSchema
      }
    });

    console.log("✅ Мир и персонажи успешно сгенерированы!");

    // Преобразуем initialNpcs в полный тип NPC с добавлением стандартных значений
    const fullNpcs: NPC[] = generatedData.initialNpcs.map(npcData => ({
      ...npcData,
      inventory: [], // Пустой инвентарь по умолчанию
      health: npcData.type === 'monster' ? 50 : 100, // У монстров меньше здоровья?
      maxHealth: npcData.type === 'monster' ? 50 : 100,
    }));

    return {
      world: {
        name: generatedData.world.name,
        description: generatedData.world.description,
        rules: "Правила мира будут раскрываться по ходу игры.", // Placeholder
        setting: generatedData.world.setting + "\n\nИстория:\n" + generatedData.world.history, // Combine setting & history
        mainStoryline: generatedData.world.mainStoryline
      },
      npcs: fullNpcs // Возвращаем полный массив NPC
    };

  } catch (error) {
    console.error("❌ Ошибка при генерации мира (после всех попыток):");
    console.error(error);
    // Re-throw the error to halt execution instead of using defaults
    throw new Error(`Не удалось сгенерировать мир и NPC после всех попыток: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to display the generated NPCs (for debugging/info)
async function displayGeneratedNPCs(npcs: NPC[]) {
  console.log("\n🧑‍🤝‍🧑 Стартовые NPC (для информации): 🧑‍🤝‍🧑");
  npcs.forEach((npc, index) => {
    console.log(formatInBox(`Имя: ${npc.name} (${npc.type})\nОписание: ${npc.description}\nХарактер: ${npc.personality}\nПредыстория: ${npc.background}\nНамерения: ${npc.intentions}\nВраждебность: ${npc.isHostile}`, 70, `Стартовый NPC ${index + 1}`));
  });
}

// Function to update game time
function updateTime(time: GameTime, minutesPassed: number): GameTime {
  const newTotalMinutes = time.totalMinutes + minutesPassed;
  const newMinute = newTotalMinutes % 60;
  const totalHours = Math.floor(newTotalMinutes / 60);
  const newHour = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  const newDay = (time.day + totalDays - 1) % 30 + 1; // Примерный месяц 30 дней
  const totalMonths = Math.floor((time.day + totalDays - 1) / 30);
  const newMonth = (time.month + totalMonths - 1) % 12 + 1;
  const newYear = time.year + Math.floor((time.month + totalMonths - 1) / 12);

  let newDayTime: GameState['time']['dayTime'];
  if (newHour >= 6 && newHour < 12) newDayTime = "утро";
  else if (newHour >= 12 && newHour < 18) newDayTime = "день";
  else if (newHour >= 18 && newHour < 24) newDayTime = "вечер";
  else newDayTime = "ночь";

  return {
    minute: newMinute,
    hour: newHour,
    day: newDay,
    month: newMonth,
    year: newYear,
    dayTime: newDayTime,
    totalMinutes: newTotalMinutes,
  };
}

// Function to display the current game state
function displayGameState(state: GameState) {
  console.log("\n============================================================");
  console.log(formatInBox(state.scene, 70, `📍 ${state.location.name} (${state.location.terrain}) | ${state.time.dayTime}, ${state.time.hour.toString().padStart(2, '0')}:${state.time.minute.toString().padStart(2, '0')} | ${state.weather.current}, ${state.weather.temperature}°C`));

  // --- Display NPCs --- 
  if (state.npcsPresent && state.npcsPresent.length > 0) {
      console.log("\n🧑‍🤝‍🧑 Присутствуют:")
      state.npcsPresent.forEach(npc => {
          console.log(formatInBox(`${npc.name} (${npc.type}) - ${npc.description}`, 60, npc.isHostile ? "🔥 Враждебный" : "👤 Персонаж"));
      });
  }
  // --- End Display NPCs ---

  console.log("\n--- Что вы будете делать? ---");
  state.options.forEach(option => {
    console.log(`${option.id}. ${option.text}`);
  });
  console.log("------------------------------");
}

// Основная функция игры
async function startGameLoop() {
  console.log("\n🎲 Добро пожаловать в текстовое RPG приключение! 🎲");

  let generatedWorld: GameWorld;
  let generatedNpcs: NPC[] = []; // Initialize to avoid potential undefined issues

  try {
    // --- Этап 1: Генерация мира и стартовых NPC ---
    console.log("--- Этап 1: Генерация мира и стартовых NPC ---"); // Added log
    ({ world: generatedWorld, npcs: generatedNpcs } = await generateInitialWorldAndNPCs());
    await displayGeneratedNPCs(generatedNpcs); // Display for info
  } catch (error) {
    console.error("💥 КРИТИЧЕСКАЯ ОШИБКА: Не удалось инициализировать мир и NPC. Завершение игры.");
    console.error(error); // Log the specific error re-thrown from generateInitialWorldAndNPCs
    rl.close();
    process.exit(1); // Exit immediately if generation fails
  }

  // --- Этап 2: Инициализация состояния игры ---
  console.log("--- Этап 2: Инициализация состояния игры ---"); // Added log
  const initialLocation = {
    name: "Лесная поляна",
    description: "Вы находитесь на небольшой поляне, окруженной густым лесом. Солнечные лучи едва пробиваются сквозь кроны деревьев. В центре поляны видны остатки старого костра.",
    terrain: "Лес"
  };

  let gameState: GameState = {
    scene: "Вы очнулись на лесной поляне, не помня, как сюда попали. Голова немного гудит.",
    location: initialLocation,
    weather: initialWeather,
    time: initialTime,
    player: initialPlayer,
    world: generatedWorld,
    npcsPresent: generatedNpcs.slice(0, 1), // Поместим первого сгенерированного NPC в стартовую локацию
    options: [
      { id: "1", text: "Осмотреться внимательнее", consequence: "Вы осматриваете поляну и ближайшие деревья.", timeChange: 10 },
      { id: "2", text: "Проверить свое состояние и снаряжение", consequence: "Вы проверяете себя на наличие ран и осматриваете свое снаряжение.", timeChange: 5 },
      { id: "3", text: "Попытаться найти тропу", consequence: "Вы решаете поискать выход с поляны.", timeChange: 20 }
    ]
  };

  // Добавляем начальное состояние в историю для AI
  history.push({ role: "system", content: `Начальное состояние игры: Игрок ${gameState.player.name} находится в локации '${gameState.location.name}'. Мир: ${gameState.world.name}. ${gameState.world.description}. Погода: ${gameState.weather.current}. Время: ${gameState.time.dayTime}. Сцена: ${gameState.scene}` });
  if (gameState.npcsPresent.length > 0) {
    history.push({ role: "system", content: `В локации присутствуют NPC: ${gameState.npcsPresent.map(npc => npc.name).join(', ')}.` });
  }

  // --- Этап 3: Основной цикл игры --- 
  while (!isGameOver) {
    displayGameState(gameState);

    const answer = await rl.question('Ваш выбор (введите номер): ');
    const choice = answer.trim();
    const selectedOption = gameState.options.find(opt => opt.id === choice);

    if (!selectedOption) {
      console.log("Неверный выбор. Пожалуйста, введите номер одного из вариантов.");
      continue;
    }

    // Добавляем действие игрока в историю
    history.push({ role: "user", content: `Игрок выбирает: ${selectedOption.text}` });

    // --- D20 Roll Example --- 
    const roll = rollD20();
    console.log(`\n굴 Проверка D20... Вы выбросили: ${roll} 🎲`);
    let successLevel = "";
    if (roll >= 15) successLevel = "(Большой успех!) ";
    else if (roll >= 10) successLevel = "(Успех!) ";
    else if (roll >= 5) successLevel = "(Частичный успех / Неудача с последствиями) ";
    else successLevel = "(Провал!) ";
    // -----------------------

    console.log(`\n⏳ Выполняется действие: ${selectedOption.text}...`);

    // Обновляем время ДО вызова AI, если оно указано
    if (selectedOption.timeChange) {
        gameState.time = updateTime(gameState.time, selectedOption.timeChange);
        console.log(`(Прошло ${selectedOption.timeChange} минут)`);
    }
    if (selectedOption.goldChange) {
        gameState.player.gold += selectedOption.goldChange;
        console.log(`(${selectedOption.goldChange > 0 ? '+' : ''}${selectedOption.goldChange} золота)`);
    }

    // --- AI Interaction --- 
    const prompt = `Предыдущая история:
${history.map(h => `${h.role}: ${h.content}`).join('\n')}

Текущее состояние:
Локация: ${gameState.location.name} (${gameState.location.description})
Погода: ${gameState.weather.current}, ${gameState.weather.temperature}°C
Время: ${gameState.time.dayTime}, ${gameState.time.hour}:${gameState.time.minute}
Игрок: ${gameState.player.name} (Здоровье: ${gameState.player.health}/${gameState.player.maxHealth})
NPC в локации: ${gameState.npcsPresent.map(n => `${n.name} (${n.description})`).join(', ') || 'Нет'}

Действие игрока: ${selectedOption.text}
Результат броска D20: ${roll} ${successLevel}

Опиши результат действия игрока, учитывая бросок D20 (${successLevel}). Обнови сцену, локацию (если изменилась), погоду, время (если не было timeChange в опции), состояние игрока (здоровье, золото, инвентарь), состояние NPC (если они взаимодействовали) и предоставь 3-5 новых осмысленных вариантов действий для игрока.

Важно: Если в локации присутствуют NPC (${gameState.npcsPresent.map(n => n.name).join(', ') || 'Нет'}), ОБЯЗАТЕЛЬНО включи варианты для взаимодействия с ними (например, 'Поговорить с [Имя NPC]', 'Осмотреть [Имя NPC]', 'Атаковать [Имя NPC]' если враждебен или уместно).

Учитывай мир (${gameState.world.name}), его правила и сюжет (${gameState.world.mainStoryline}). Ответ должен строго соответствовать JSON schema GameStateSchema. Не включай описание мира в ответ.`;

    try {
      const aiResponse = await generateStructured(prompt, {
        schema: GameStateSchema,
        history: history, // Передаем текущую историю
        jsonSchema: {
          name: "GameStateUpdate",
          description: "Обновление состояния игры на основе действия игрока",
          schema: GameStateSchema
        }
      });

      // Обновляем состояние игры данными от AI
      // Важно: обновляем только те поля, которые AI может изменить
      gameState.scene = aiResponse.scene;
      gameState.location = aiResponse.location ?? gameState.location;
      gameState.weather = aiResponse.weather ?? gameState.weather;
      gameState.time = aiResponse.time ?? gameState.time; // AI может сам решить, сколько времени прошло
      gameState.player = aiResponse.player ?? gameState.player;
      gameState.npcsPresent = aiResponse.npcsPresent ?? gameState.npcsPresent;
      gameState.options = aiResponse.options;

      // Добавляем ответ AI в историю
      history.push({ role: "assistant", content: aiResponse.scene }); // Записываем основную сцену как ответ

      // Проверка на конец игры (например, по состоянию здоровья)
      if (gameState.player.health <= 0) {
        console.log(formatInBox("💀 Ваше здоровье иссякло... Игра окончена. 💀", 70, "Конец игры"));
        isGameOver = true;
      }
      // TODO: Добавить другие условия конца игры (например, выполнение цели)

    } catch (error) {
      console.error("❌ Ошибка при получении ответа от AI:", error);
      console.log("Произошла ошибка. Попробуйте выбрать другое действие.");
      // Откатываем историю, если AI не ответил
      history.pop(); // Убираем действие игрока
    }
  }

  rl.close();
  console.log("\n👋 Спасибо за игру!");
}

// Запускаем игру
startGameLoop().catch(console.error);
