import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('SQLite local persiste dados e desfaz um lote inteiro em caso de erro', async () => {
  process.env.GUICHE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'guiche-test-'));
  const { env: { DB } } = await import('../lib/local-env.ts');
  await DB.prepare('INSERT INTO unit_state (id,data) VALUES (?,?)').bind('unit', '{}').run();
  await assert.rejects(DB.batch([
    DB.prepare('UPDATE unit_state SET version=version+1 WHERE id=?').bind('unit'),
    DB.prepare('INSERT INTO unit_state (id,data) VALUES (?,?)').bind('unit', '{}'),
  ]));
  const read = await DB.batch([DB.prepare('SELECT version FROM unit_state WHERE id=?').bind('unit')]);
  assert.equal(read[0].results[0].version, 0);
  const saved = await DB.batch([DB.prepare('UPDATE unit_state SET version=version+1 WHERE id=? AND version=?').bind('unit', 0)]);
  assert.equal(saved[0].meta.changes, 1);
  const stale = await DB.batch([DB.prepare('UPDATE unit_state SET version=version+1 WHERE id=? AND version=?').bind('unit', 0)]);
  assert.equal(stale[0].meta.changes, 0);
  const reopened = new DatabaseSync(path.join(process.env.GUICHE_DATA_DIR, 'guiche.sqlite'));
  assert.equal(reopened.prepare('SELECT version FROM unit_state').get()?.version, 1);
  reopened.close();
});
