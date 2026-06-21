import { appConfig } from '../config/index.js';
import { parseArgs } from './args.js';
import { buildCliContext } from './context.js';
import { printPlan } from './format.js';
import { createPlan } from '../strategy/strategyEngine.js';
import { hasClientOrderId, recordOrders, recordPlan } from '../storage/orderStore.js';

const args = parseArgs();
const symbol = String(args.symbol || process.env.IB_SYMBOL || 'TQQQ').toUpperCase();
const context = buildCliContext(symbol, args);
const plan = createPlan(context);
const plannedOrders = [...plan.buyOrders, ...plan.sellOrders].filter((order) => !hasClientOrderId(order.clientOrderId));

plan.inputAveragePrice = context.portfolio.averagePrice;
plan.currentRound = context.state.currentRound;
recordPlan(plan);
printPlan(plan);

if (!args.confirm) {
  console.log('주문 전송 안 함: --confirm 옵션이 필요합니다.');
  process.exit(0);
}

if (appConfig.mode === 'LIVE' && (appConfig.enableAutoOrder !== true || appConfig.liveConfirm !== 'YES')) {
  throw new Error('LIVE order blocked. ENABLE_AUTO_ORDER=true and LIVE_CONFIRM=YES are required.');
}

recordOrders(plannedOrders, {
  mode: appConfig.mode,
  status: appConfig.mode === 'LIVE' ? 'READY_FOR_LIVE_SUBMISSION' : 'PAPER_RECORDED',
  createdAt: new Date().toISOString()
});

console.log(`${plannedOrders.length}개 주문을 ${appConfig.mode === 'LIVE' ? '실거래 전송 대기 기록' : 'paper 주문 기록'}으로 저장했습니다.`);
