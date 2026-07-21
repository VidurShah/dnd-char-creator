import type { Ability } from '@/schema/common';

export interface ExprContext {
  prof: number;
  totalLevel: number;
  classLevels: Record<string, number>;
  abilityMods: Record<Ability, number>;
}

type TokenType = 'number' | 'ident' | 'punct' | 'end';
interface Token {
  type: TokenType;
  value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j++;
      tokens.push({ type: 'number', value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
      tokens.push({ type: 'ident', value: source.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      tokens.push({ type: 'punct', value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${ch}' in expression "${source}"`);
  }
  tokens.push({ type: 'end', value: '' });
  return tokens;
}

const NUMERIC_FUNCTIONS: Record<string, (args: number[]) => number> = {
  max: (args) => Math.max(...args),
  min: (args) => Math.min(...args),
  floor: (args) => Math.floor(args[0]),
  ceil: (args) => Math.ceil(args[0]),
  abs: (args) => Math.abs(args[0]),
};

/** Functions whose argument is a bare identifier (an ability or class id), not a sub-expression. */
const IDENT_ARG_FUNCTIONS = new Set(['mod', 'level']);

class ExprParser {
  private pos = 0;
  private tokens: Token[];
  private ctx: ExprContext;

  constructor(tokens: Token[], ctx: ExprContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expectPunct(value: string): void {
    const tok = this.consume();
    if (tok.type !== 'punct' || tok.value !== value) {
      throw new Error(`Expected '${value}' but got '${tok.value}'`);
    }
  }

  parse(): number {
    const value = this.parseExpr();
    if (this.peek().type !== 'end') {
      throw new Error(`Unexpected trailing token '${this.peek().value}'`);
    }
    return value;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    while (this.peek().type === 'punct' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const rhs = this.parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (this.peek().type === 'punct' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value;
      const rhs = this.parseUnary();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peek().type === 'punct' && this.peek().value === '-') {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.consume();

    if (tok.type === 'number') return Number(tok.value);

    if (tok.type === 'punct' && tok.value === '(') {
      const value = this.parseExpr();
      this.expectPunct(')');
      return value;
    }

    if (tok.type === 'ident') {
      if (this.peek().type === 'punct' && this.peek().value === '(') {
        return this.parseCall(tok.value);
      }
      return this.resolveBareIdent(tok.value);
    }

    throw new Error(`Unexpected token '${tok.value}'`);
  }

  private parseCall(name: string): number {
    this.consume(); // '('
    const takesIdentArg = IDENT_ARG_FUNCTIONS.has(name);

    if (takesIdentArg) {
      // mod(wis), level(), level(fighter) — zero or one bare identifier argument.
      let arg: string | undefined;
      if (!(this.peek().type === 'punct' && this.peek().value === ')')) {
        arg = this.consume().value;
      }
      this.expectPunct(')');
      return name === 'mod' ? this.resolveMod(arg) : this.resolveLevel(arg);
    }

    const args: number[] = [];
    if (!(this.peek().type === 'punct' && this.peek().value === ')')) {
      args.push(this.parseExpr());
      while (this.peek().type === 'punct' && this.peek().value === ',') {
        this.consume();
        args.push(this.parseExpr());
      }
    }
    this.expectPunct(')');
    const fn = NUMERIC_FUNCTIONS[name];
    if (!fn) throw new Error(`Unknown function '${name}'`);
    return fn(args);
  }

  private resolveMod(ability: string | undefined): number {
    if (!ability) throw new Error('mod() requires an ability argument');
    const value = this.ctx.abilityMods[ability as Ability];
    if (value === undefined) throw new Error(`Unknown ability '${ability}' in mod()`);
    return value;
  }

  private resolveLevel(classId: string | undefined): number {
    return classId === undefined ? this.ctx.totalLevel : (this.ctx.classLevels[classId] ?? 0);
  }

  private resolveBareIdent(name: string): number {
    if (name === 'prof') return this.ctx.prof;
    if (name === 'level') return this.ctx.totalLevel;
    throw new Error(`Unknown identifier '${name}'`);
  }
}

/** Evaluates a whitelisted mini-expression (see src/schema/common.ts ExprSchema) against a sheet-computation context. */
export function evalExpr(source: string, ctx: ExprContext): number {
  return new ExprParser(tokenize(source), ctx).parse();
}
