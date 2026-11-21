export async function lockDoctorDay(transaction, doctorId, date) {
  await transaction.doctorDay.upsert({
    where: { doctorId_date: { doctorId, date } },
    update: {},
    create: { doctorId, date },
  });
  await transaction.$queryRaw`
    SELECT "id"
    FROM "DoctorDay"
    WHERE "doctorId" = ${doctorId}::uuid AND "date" = ${date}::date
    FOR UPDATE
  `;
  return transaction.doctorDay.findUnique({
    where: { doctorId_date: { doctorId, date } },
  });
}
