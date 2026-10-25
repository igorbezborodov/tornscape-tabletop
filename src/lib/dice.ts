export const rollDice = (count: number, sides: number): number[] =>
  Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);