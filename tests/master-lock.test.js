import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  acquireMasterLock,
  isMasterLocked,
  isProcessAlive,
  getLockFilePath
} from '../tools/lib/master-lock.js';

describe('Master Sequential Ingestion Lock Tests', () => {
  let tempMasterDir;

  beforeEach(() => {
    tempMasterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-lock-test-'));
    fs.mkdirSync(path.join(tempMasterDir, 'data', 'state'), { recursive: true });
    fs.mkdirSync(path.join(tempMasterDir, 'tools'), { recursive: true });
    fs.writeFileSync(path.join(tempMasterDir, 'tools', 'build.js'), '// mock build.js');
    fs.writeFileSync(path.join(tempMasterDir, 'data', 'sources.json'), '{}');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempMasterDir, { recursive: true, force: true });
    } catch (_) {}
  });

  test('isMasterLocked reports unlocked when no lockfile exists', () => {
    const status = isMasterLocked(tempMasterDir);
    assert.strictEqual(status.locked, false);
    assert.strictEqual(status.isStale, false);
    assert.strictEqual(status.metadata, null);
  });

  test('acquireMasterLock creates lockfile and isMasterLocked detects it', async () => {
    const lock = await acquireMasterLock({
      masterPath: tempMasterDir,
      provider: 'pnm',
      operation: 'build',
      wait: false
    });

    assert.ok(lock);
    assert.strictEqual(typeof lock.release, 'function');
    assert.strictEqual(lock.metadata.provider, 'pnm');
    assert.strictEqual(lock.metadata.operation, 'build');
    assert.strictEqual(lock.metadata.pid, process.pid);

    const status = isMasterLocked(tempMasterDir);
    assert.strictEqual(status.locked, true);
    assert.strictEqual(status.isStale, false);
    assert.strictEqual(status.metadata.provider, 'pnm');

    // Release lock
    lock.release();

    const afterStatus = isMasterLocked(tempMasterDir);
    assert.strictEqual(afterStatus.locked, false);
  });

  test('acquireMasterLock throws when locked and wait: false', async () => {
    const lock1 = await acquireMasterLock({
      masterPath: tempMasterDir,
      provider: 'pnm',
      operation: 'build',
      wait: false
    });

    try {
      await assert.rejects(
        async () => {
          await acquireMasterLock({
            masterPath: tempMasterDir,
            provider: 'ppapp',
            operation: 'ingest',
            wait: false
          });
        },
        /Master repository is locked by 'pnm'/
      );
    } finally {
      lock1.release();
    }
  });

  test('acquireMasterLock automatically overrides stale lock (dead PID)', async () => {
    const lockPath = getLockFilePath(tempMasterDir);
    const stalePid = 99999999; // extremely unlikely to exist
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        provider: 'old-dead-provider',
        operation: 'crawl',
        pid: stalePid,
        timestamp: new Date().toISOString()
      }),
      'utf8'
    );

    assert.strictEqual(isProcessAlive(stalePid), false);

    const statusBefore = isMasterLocked(tempMasterDir);
    assert.strictEqual(statusBefore.isStale, true);

    // Should reclaim lock cleanly
    const lock = await acquireMasterLock({
      masterPath: tempMasterDir,
      provider: 'ppapp',
      operation: 'ingest',
      wait: false
    });

    assert.strictEqual(lock.metadata.provider, 'ppapp');
    lock.release();
  });

  test('acquireMasterLock queues sequentially and acquires after first lock releases', async () => {
    const lock1 = await acquireMasterLock({
      masterPath: tempMasterDir,
      provider: 'pnm',
      operation: 'harvest-merge',
      wait: false
    });

    let acquiredSecond = false;

    // Launch second acquisition in background with wait: true
    const secondPromise = acquireMasterLock({
      masterPath: tempMasterDir,
      provider: 'ppapp',
      operation: 'ingest',
      wait: true,
      retryIntervalMs: 50,
      timeoutMs: 3000
    }).then(lock2 => {
      acquiredSecond = true;
      lock2.release();
    });

    // Verify second has not acquired yet
    assert.strictEqual(acquiredSecond, false);

    // Release first lock after 150ms
    setTimeout(() => {
      lock1.release();
    }, 150);

    await secondPromise;
    assert.strictEqual(acquiredSecond, true);
  });
});
