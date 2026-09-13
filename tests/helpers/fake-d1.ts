type Row = Record<string, unknown>;

type FakeResult<T> = {
  success: true;
  results: T[];
  meta: {
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
    last_row_id: number;
    changed_db: boolean;
    changes: number;
  };
};

const result = <T>(results: T[], changes = 0): FakeResult<T> => ({
  success: true,
  results,
  meta: {
    duration: 0,
    size_after: 0,
    rows_read: results.length,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
  },
});

class FakePreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly rows: Map<string, Row[]>,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async run(): Promise<FakeResult<Row>> {
    const updateMatch = this.query.match(
      /update\s+(\w+)\s+set\s+(\w+)\s*=\s*([^\s]+)\s+where\s+(\w+)\s*=\s*\?/i,
    );
    if (updateMatch) {
      const [, table, column, rawValue, whereColumn] = updateMatch;
      const value = rawValue === '?' ? this.values[0] : Number(rawValue);
      const whereValue = this.values[rawValue === '?' ? 1 : 0];
      let changes = 0;
      for (const row of this.rows.get(table) ?? []) {
        if (row[whereColumn] !== whereValue) continue;
        row[column] = value;
        changes += 1;
      }
      return result([], changes);
    }

    const match = this.query.match(/insert(?:\s+or\s+ignore)?\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i);
    if (!match) throw new Error(`FakeD1 does not support this SQL: ${this.query}`);
    const columns = match[2].split(',').map((column) => column.trim());
    const tableRows = this.rows.get(match[1]) ?? [];
    if (/insert\s+or\s+ignore/i.test(this.query) && tableRows.some((row) => row.id === this.values[columns.indexOf('id')])) {
      return result([], 0);
    }
    tableRows.push(Object.fromEntries(columns.map((column, index) => [column, this.values[index]])));
    this.rows.set(match[1], tableRows);
    return result([], 1);
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = await this.all<T>();
    return rows.results[0] ?? null;
  }

  async all<T = Row>(): Promise<FakeResult<T>> {
    const countMatch = this.query.match(/select\s+count\(\*\)\s+as\s+(\w+)\s+from\s+(\w+)\s+where\s+(\w+)\s*=\s*\?/i);
    if (countMatch) {
      const count = (this.rows.get(countMatch[2]) ?? []).filter((row) => row[countMatch[3]] === this.values[0]).length;
      return result([{ [countMatch[1]]: count } as T]);
    }
    const match = this.query.match(/select\s+(.+?)\s+from\s+(\w+)\s+where\s+(\w+)\s*=\s*\?/i);
    if (!match) throw new Error(`FakeD1 does not support this SQL: ${this.query}`);
    const columns = match[1].split(',').map((column) => column.trim());
    const filtered = (this.rows.get(match[2]) ?? []).filter((row) => row[match[3]] === this.values[0]);
    return result(filtered.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])) as T));
  }
}

/** A deliberately small test double for the INSERT/SELECT patterns used in tests. */
export function createFakeD1(): D1Database {
  const rows = new Map<string, Row[]>();
  return {
    prepare(query: string) {
      return new FakePreparedStatement(query, rows) as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}
