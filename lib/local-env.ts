import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const folder = path.resolve(process.env.GUICHE_DATA_DIR || '.local-data');
mkdirSync(folder, { recursive: true });
const databasePath = process.env.GUICHE_BUILD === '1' ? ':memory:' : path.join(folder, 'guiche.sqlite');
const databases = globalThis as typeof globalThis & {
    guicheDatabases?: Map<string, DatabaseSync>;
};
databases.guicheDatabases ??= new Map();
let connection = databases.guicheDatabases.get(databasePath);
if (!connection) {
    connection = new DatabaseSync(databasePath);
    connection.exec('PRAGMA busy_timeout=10000');
    connection.exec('PRAGMA journal_mode=WAL');
    databases.guicheDatabases.set(databasePath, connection);
}
export const sqlite = connection;
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS unit_state (
    id TEXT PRIMARY KEY NOT NULL, version INTEGER DEFAULT 0 NOT NULL, data TEXT NOT NULL
  );`);
class Statement {
    private sql: string;
    private values: SQLInputValue[];
    constructor(sql: string, values: SQLInputValue[] = []) { this.sql = sql; this.values = values; }
    bind(...values: SQLInputValue[]) { return new Statement(this.sql, values); }
    execute() {
        const statement = sqlite.prepare(this.sql);
        if (statement.columns().length) {
            return { results: statement.all(...this.values), success: true, meta: { changes: 0 } };
        }
        const result = statement.run(...this.values);
        return { results: [], success: true, meta: { changes: Number(result.changes) } };
    }
    async run() { return this.execute(); }
}
export const env = { DB: {
        prepare(sql: string) { return new Statement(sql); },
        async batch(statements: Statement[]) {
            sqlite.exec('BEGIN IMMEDIATE');
            try {
                const result = statements.map(statement => statement.execute());
                sqlite.exec('COMMIT');
                return result;
            }
            catch (error) {
                sqlite.exec('ROLLBACK');
                throw error;
            }
        },
    } };
