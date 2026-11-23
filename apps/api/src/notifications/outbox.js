export async function enqueueEmail(transaction, { dedupeKey, eventType, payload }) {
  return transaction.outboxEvent.upsert({
    where: { dedupeKey },
    create: { dedupeKey, eventType, payload },
    update: {},
  });
}
