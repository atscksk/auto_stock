import { createTossClient } from '../../../../shared/tossClient.js';
import { appConfig } from '../config/index.js';

export function createConfiguredTossClient() {
  return createTossClient({
    clientId: appConfig.toss.clientId,
    clientSecret: appConfig.toss.clientSecret,
    baseUrl: appConfig.toss.baseUrl
  });
}
