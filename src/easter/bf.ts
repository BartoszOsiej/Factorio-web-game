const TAPE_SIZE = 30000;

export function runBrainfuck(code: string, input = ''): string {
  const tape = new Uint8Array(TAPE_SIZE);
  let ptr = 0;
  let ip = 0;
  let inputPtr = 0;
  const output: string[] = [];

  const loopStack: number[] = [];
  const loopMap = new Map<number, number>();

  for (let i = 0; i < code.length; i++) {
    if (code[i] === '[') loopStack.push(i);
    else if (code[i] === ']') {
      const start = loopStack.pop()!;
      loopMap.set(i, start);
      loopMap.set(start, i);
    }
  }

  while (ip < code.length) {
    const c = code[ip];
    switch (c) {
      case '>': ptr++; break;
      case '<': ptr--; break;
      case '+': tape[ptr]++; break;
      case '-': tape[ptr]--; break;
      case '.': output.push(String.fromCharCode(tape[ptr])); break;
      case ',':
        tape[ptr] = inputPtr < input.length ? input.charCodeAt(inputPtr++) : 0;
        break;
      case '[':
        if (tape[ptr] === 0) ip = loopMap.get(ip)!;
        break;
      case ']':
        if (tape[ptr] !== 0) ip = loopMap.get(ip)!;
        break;
    }
    ip++;
  }

  return output.join('');
}

export function isBrainfuck(input: string): boolean {
  return /^[+\-<>[\].,\s]*$/.test(input);
}
