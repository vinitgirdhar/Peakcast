// node:sqlite's DatabaseSync API, implemented on sql.js (SQLite compiled to
// WebAssembly), so server/database.ts runs unchanged on the device.
import type { Database, SqlJsStatic, SqlValue } from "sql.js";

type Param = SqlValue | boolean | undefined;

const bindable = (params: Param[]) =>
  params.map((value) =>
    value === undefined
      ? null
      : typeof value === "boolean"
        ? Number(value)
        : value,
  );

class StatementSync {
  constructor(
    private readonly owner: SqlJsDatabase,
    private readonly sql: string,
  ) {}

  private rows(params: Param[], limit = Infinity) {
    const statement = this.owner.db.prepare(this.sql);
    try {
      statement.bind(bindable(params));
      const rows: Record<string, SqlValue>[] = [];
      while (rows.length < limit && statement.step())
        rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  get(...params: Param[]) {
    return this.rows(params, 1)[0];
  }

  all(...params: Param[]) {
    return this.rows(params);
  }

  run(...params: Param[]) {
    const db = this.owner.db;
    db.run(this.sql, bindable(params));
    const changes = db.getRowsModified();
    const lastInsertRowid = db.exec("SELECT last_insert_rowid()")[0]
      .values[0][0] as number;
    if (changes) this.owner.onWrite();
    return { changes, lastInsertRowid };
  }
}

export class SqlJsDatabase {
  db: Database;

  /** Opens `bytes` (a saved database) or a new empty one; `onWrite` runs after each change. */
  constructor(
    SQL: SqlJsStatic,
    bytes?: Uint8Array,
    readonly onWrite: () => void = () => undefined,
  ) {
    this.db = new SQL.Database(bytes);
  }

  exec(sql: string) {
    this.db.exec(sql);
    if (!/^\s*(PRAGMA|SELECT)\b/i.test(sql)) this.onWrite();
  }

  prepare(sql: string) {
    return new StatementSync(this, sql);
  }

  /**
   * The whole database as bytes. sql.js closes and reopens the connection to
   * export, which resets connection settings, so they are applied again.
   */
  export() {
    const bytes = this.db.export();
    this.db.exec("PRAGMA foreign_keys=ON;");
    return bytes;
  }

  close() {
    this.db.close();
  }
}

/** Target of the "node:sqlite" alias in vite.config.ts; never opened by path on the device. */
export class DatabaseSync {
  constructor() {
    throw new Error("The on-device app opens its database with SqlJsDatabase.");
  }
}
