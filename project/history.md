# История изменений проекта

## 2025-04-09 14:25
- Добавлена поддержка золота в игровых действиях с параметром `goldChange`
- Улучшено отображение информации о вариантах действий с показом времени и золота
- Исправлена проблема с неправильным отображением времени в тексте сцены
- Улучшен промпт для генерации сцен с подробными инструкциями

## 2025-04-09 13:59
- Исправлены синтаксические ошибки в функции `startDndGame`
- Добавлено отображение сцены после генерации нового состояния игры
- Правильно структурирован игровой цикл с корректной обработкой ошибок
- Оптимизирован код для стабильной работы игровой логики

## 2025-04-09 (вечер)
- Исправлены ошибки в коде игры, связанные с обработкой ответов API
- Реализована поддержка инвентаря и системы управления предметами
- Добавлена система учета времени в игре с автоматическим обновлением времени суток
- Улучшен интерфейс игры с отображением здоровья, времени, погоды и NPC
- Добавлена проверка состояния персонажа (здоровье) и завершение игры при гибели

## 2025-04-09 (утро)
- Внедрена поддержка структурированных ответов с использованием OpenRouter API
- Изменена модель по умолчанию на openai/gpt-4o для поддержки структурированных выходных данных
- Добавлены новые параметры для повышения стабильности API запросов
- Исправлены ошибки при обработке структурированных ответов

## 09.04.2025 12:55 - Реализация официального механизма Structured Outputs

### Улучшения в файле `ai.ts`:
- Добавлен параметр `response_format` для структурированных ответов согласно документации OpenRouter
- Изменена модель по умолчанию на `openai/gpt-4o`, которая имеет стабильную поддержку structured outputs
- Включен параметр `strict: true` для гарантии соответствия ответа схеме

## 09.04.2025 12:45 - Исправление ошибок взаимодействия с API

### Улучшения в файле `ai.ts`:
- Изменена модель по умолчанию с `google/gemini-2.5-pro-exp-03-25:free` на более стабильную `openai/gpt-3.5-turbo`
- Добавлены оптимальные параметры для структурированных ответов:
  - Ограничение числа токенов (max_tokens: 1024)
  - Снижение температуры до 0.5 для более предсказуемых ответов
  - Установлен таймаут 30 секунд
- Улучшена обработка ошибок API с подробным логированием
- Исправлены ошибки синтаксиса в функции `generateStructured`

## 09.04.2025 - Улучшение взаимодействия с AI

### Улучшения в файле `ai.ts`:
- Добавлен класс `RateLimiter` для управления квотами API
  - Реализован механизм очереди запросов
  - Добавлена логика повторных попыток при ошибках API
  - Добавлено соблюдение ограничений частоты запросов
- Улучшена функция `generateStructured`:
  - Добавлена интеграция с `rateLimiter`
  - Улучшена обработка JSON-ответов от модели
  - Добавлена надежная обработка ошибок с информативными сообщениями
  - Реализована логика повторных попыток в случае неудачи
- Улучшена функция `generateText`:
  - Добавлена поддержка инструментов (tools)
  - Интегрирована с системой обработки квот
- Добавлен простой логгер для отладки, управляемый переменной окружения `DEBUG`
- Добавлены интерфейсы для типизации инструментов и их вызовов

### Улучшения в файле `app.ts`:
- Обновлены вызовы функций генерации текста и структурированных ответов
- Улучшена обработка ошибок при взаимодействии с AI

### Улучшения в зависимостях:
- Добавлена библиотека для логирования

## 2025-04-10 13:46
*   Refactored the codebase for better organization.
*   Created `src/types` directory and `src/types/index.ts` to hold all TypeScript interfaces.
*   Created `src/game` directory and `src/game/initialData.ts` to hold initial game setup data.
*   Updated imports in `src/app.ts`.
*   Updated `structure.md` to reflect the new file structure.

## 2025-04-10 13:50
*   Created `src/utils.ts`.
*   Added `rollD20()` function for dice rolling.
*   Added `formatInBox()` function for basic console UI formatting.
*   Integrated `formatInBox` into `displayGameState` in `src/app.ts` to format scene descriptions.
*   Added a demonstration d20 roll output in the main game loop in `src/app.ts`.
*   Updated `structure.md`.

## 2025-04-10 13:53
*   Added `WorldGenerationSchema` to `src/app.ts` for structuring AI output for world/NPC generation.
*   Added `generateInitialWorldAndNPCs()` async function to `src/app.ts` to handle the generation prompt and AI call.
*   Modified `startDndGame()` in `src/app.ts` to call `generateInitialWorldAndNPCs()` at the beginning.
*   The generated world data (`name`, `description`, `setting`, `mainStoryline`) is now used in the initial `gameState`.
*   Generated NPCs are logged to the console at startup (integration into gameplay to come later).
*   Updated Zod schema descriptions in `GameStateSchema` for better clarity.
*   Updated initial game options in `startDndGame`.

## 2025-04-10 14:05
*   Modified `startDndGame` in `src/app.ts`:
    *   Populated `gameState.npcsPresent` with the `generatedNpcs` obtained from `generateInitialWorldAndNPCs`.
    *   Added default values (`inventory: []`, `health: 100`, `maxHealth: 100`) for each NPC during mapping to ensure they conform to the `NPC` interface defined in `src/types/index.ts`.

## 2025-04-10 14:15
*   Rewrote `src/app.ts` for better structure and added NPC display:
    *   Renamed main function `startDndGame` to `startGameLoop`.
    *   Created a new function `displayGameState` to handle printing the scene, location, time, weather, NPCs present, and player options.
    *   Modified `displayGameState` to iterate through `gameState.npcsPresent` and display each NPC's name, type, and description using `formatInBox`.
    *   Integrated `displayGameState` call into the main `startGameLoop`.
    *   Updated `generateInitialWorldAndNPCs` to return the full `NPC[]` type.
    *   Placed the first generated NPC into the initial `gameState.npcsPresent`.
    *   Refined Zod schemas (e.g., NPC ID as UUID) and AI prompts.
    *   Added system messages to AI history about initial NPC presence.
    *   Initialized `readline` interface once globally.

## 2025-04-10 14:20
*   Modified the AI prompt within the `startGameLoop` function in `src/app.ts`.
*   Added explicit instructions for the AI to generate player options for interacting with NPCs currently listed in `gameState.npcsPresent` (e.g., 'Talk to [NPC Name]', 'Examine [NPC Name]', 'Attack [NPC Name]').

## 2025-04-10 14:25
*   Fixed `TypeError: WorldGenerationSchema.openapi is not a function` in `src/app.ts` by removing the `.openapi()` calls from the `generateStructured` parameters for `WorldGenerationSchema` and `GameStateSchema`.
*   Fixed `RangeError: String.prototype.repeat argument must be... not be Infinity` in `src/utils.ts` (`formatInBox` function) by ensuring the padding calculation uses `Math.max(0, maxWidth - line.length)` to prevent negative values being passed to `repeat()`.

## 2025-04-10 14:30
*   Improved error handling in `generateStructured` function in `src/ai.ts`:
    *   Removed incorrect check that attempted to detect if AI returned a schema definition (which caused a `TypeError` when response was not an object).
    *   Added explicit check to ensure the parsed AI response is a non-null object before attempting Zod validation, preventing `ZodError: Expected object, received string`.

## 2025-04-10 14:40
*   Modified the `schemaDescription` (system prompt) within the `generateStructured` function in `src/ai.ts` to be extremely strict about the AI returning ONLY a raw JSON object.
*   Explicitly forbade returning markdown, surrounding text, null, or strings.
*   Removed backticks around the schema display in the prompt as a workaround for tool limitations.

## 2025-04-10 14:50
*   Added debug logging in the `generateStructured` function (`src/ai.ts`) to print the raw AI response content (`response.choices[0].message.content`) before any JSON parsing or validation attempts.

## 2025-04-10 15:00
*   Corrected the retry loop logic within the `generateStructured` function (`src/ai.ts`):
    *   Reverted unintended changes to API request parameters introduced by a previous tool error.
    *   Ensured correct message history (`currentMessages`) is used for retry prompts.
    *   Ensured original `requestParams` (including model, temp, etc.) are used for the API call.
*   Confirmed addition of `logger.debug` to log the raw AI response string (`jsonStr`) before `JSON.parse`.

## 2025-04-10 15:10
*   Added logic in `generateStructured` (`src/ai.ts`) to strip surrounding markdown code block fences (```json` and ````) and trim whitespace from the raw AI response string *before* attempting `JSON.parse`.
*   Added logging of the cleaned string in case of a parse error for better debugging.

## 2025-04-10 15:20
*   Refined the prompt within the `generateInitialWorldAndNPCs` function (`src/app.ts`) to address Zod validation errors:
    *   Added explicit textual instructions emphasizing that all non-optional schema fields are mandatory.
    *   Specifically stated that `world.setting` and `world.history` must be simple strings.
    *   Required the `initialNpcs` field to be an array containing at least 3 NPC objects.
    *   Stressed that each NPC must include all required fields, with `id` strictly being a valid UUID.

## 2025-04-10 15:45
*   Further refined the prompt in `generateInitialWorldAndNPCs` (`src/app.ts`):
    *   Explicitly listed the *only* allowed values for `npc.type`: 'human', 'animal', 'monster', 'other', forbidding common fantasy races.
    *   Re-emphasized with stronger wording that `world.mainStoryline` is absolutely mandatory.
*   Modified the `catch` block in `generateInitialWorldAndNPCs` to re-throw the error after logging if AI generation fails after all attempts, preventing the game from proceeding with potentially invalid default data.

## 2025-04-10 16:00
*   Applied final refinement to the prompt in `generateInitialWorldAndNPCs` (`src/app.ts`):
    *   Specifically demanded that *each and every* NPC ID must strictly adhere to the UUIDv4 format, providing an example.
*   Modified `startGameLoop` function (`src/app.ts`):
    *   Wrapped the `await generateInitialWorldAndNPCs()` call in a `try...catch` block.
    *   The `catch` block now logs a critical error message, closes the readline interface (`rl.close()`), and terminates the process (`process.exit(1)`) if the initial world/NPC generation fails. This ensures the game halts cleanly on critical initialization errors.
