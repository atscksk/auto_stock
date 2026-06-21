export async function getConfiguredAccountSeq({ tossClient, accountSeq }) {
  if (accountSeq) return accountSeq;
  const accounts = await tossClient.getAccounts();
  const firstAccount = Array.isArray(accounts) ? accounts[0] : accounts?.items?.[0];
  if (!firstAccount?.accountSeq) throw new Error('No Toss accountSeq found.');
  return firstAccount.accountSeq;
}
