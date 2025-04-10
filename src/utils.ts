/**
 * Rolls a 20-sided die (d20).
 * @returns A random integer between 1 and 20 (inclusive).
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Formats a given text string within a simple console box.
 * @param text The text to format.
 * @param width The desired width of the box. If not provided, it adjusts to the text length.
 * @param title Optional title to display on the top border.
 * @returns The formatted text string with borders.
 */
export function formatInBox(text: string, width?: number, title?: string): string {
  const lines = text.split('\n');
  const maxWidth = width || Math.max(...lines.map(line => line.length));
  const horizontalBorder = '═'.repeat(maxWidth + 2);

  let topBorder = '╔' + horizontalBorder + '╗';
  if (title) {
    const titlePadding = Math.max(0, maxWidth - title.length);
    const leftPadding = Math.floor(titlePadding / 2);
    const rightPadding = titlePadding - leftPadding;
    topBorder = `╔═[ ${title} ]${'═'.repeat(leftPadding + rightPadding - 1)}╗`; // Adjust padding for title
    // Ensure the border length matches maxWidth + 2
    const currentLength = 4 + title.length + leftPadding + rightPadding -1 ; // ╔═[ title ]═...╗
    const neededLength = maxWidth + 2;
    if (currentLength < neededLength) {
       topBorder = `╔═[ ${title} ]${'═'.repeat(neededLength - currentLength +1 )}╗`;
    } else if (currentLength > neededLength) {
       // This case should ideally not happen if width is respected, but as a fallback:
       topBorder = topBorder.substring(0, neededLength -1) + '╗';
    }

  }

  const bottomBorder = '╚' + horizontalBorder + '╝';

  const content = lines.map(line => {
    // Ensure padding is never negative
    const padding = ' '.repeat(Math.max(0, maxWidth - line.length));
    return '║ ' + line + padding + ' ║';
  }).join('\n');

  return `${topBorder}\n${content}\n${bottomBorder}`;
}
