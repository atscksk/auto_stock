import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNotificationMessage,
  hasNotificationTarget,
  notifyEvent
} from '../../../shared/notificationService.js';

test('detects missing notification target', () => {
  assert.equal(hasNotificationTarget({ enabled: true }), false);
  assert.equal(hasNotificationTarget({ enabled: false, discordWebhookUrl: 'https://example.com' }), false);
  assert.equal(hasNotificationTarget({ enabled: true, discordWebhookUrl: 'https://example.com' }), true);
  assert.equal(hasNotificationTarget({ enabled: true, telegramBotToken: 'token', telegramChatId: 'chat' }), true);
});

test('skips notification when no target is configured', async () => {
  const result = await notifyEvent({ title: 'test' }, { config: { enabled: true } });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'NO_NOTIFICATION_TARGET');
});

test('formats notification and redacts obvious secrets', () => {
  const message = formatNotificationMessage({
    severity: 'ERROR',
    title: 'Failure',
    symbol: 'TQQQ',
    message: 'client_secret abc123 failed',
    details: { authorization: 'Bearer abc.def' },
    timestamp: '2026-06-28T00:00:00.000Z'
  });

  assert.match(message, /\[ERROR\] Failure/);
  assert.match(message, /종목: TQQQ/);
  assert.doesNotMatch(message, /abc123/);
  assert.doesNotMatch(message, /abc\.def/);
});

test('formats heartbeat in Korean summary style', () => {
  const message = formatNotificationMessage({
    type: 'HEARTBEAT',
    severity: 'INFO',
    strategy: 'infinite_buying',
    symbol: 'TQQQ',
    message: 'scheduled job host is alive',
    details: {
      hostname: 'auto-stock',
      uptimeSeconds: 3661,
      loadAverage: [0, 0.01, 0.02],
      rssMb: 43,
      heapUsedMb: 5
    },
    timestamp: '2026-06-28T01:48:37.573Z'
  });

  assert.match(message, /\[INFO\] 자동매매 서버 생존 확인/);
  assert.match(message, /전략: infinite_buying/);
  assert.match(message, /종목: TQQQ/);
  assert.match(message, /내용: 스케줄 실행 서버가 정상 동작 중입니다\./);
  assert.match(message, /서버: auto-stock/);
  assert.match(message, /가동시간: 1시간 1분 1초/);
});
