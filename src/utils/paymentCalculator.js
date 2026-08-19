export function calculateTotals({
  baseAmountARS,
  payments,
  paymentInstallments,
}) {
  // Pagos sin interés
  const paidNoInterest = payments
    .filter((p) => {
      const inst = paymentInstallments.find(
        (i) =>
          i.payment_method_id === Number(p.payment_method_id) &&
          Number(p.installments || 0) === i.installments
      );
      return !inst || inst.multiplier === 1;
    })
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);

  const saldo = Math.max(baseAmountARS - paidNoInterest, 0);

  const interestMethod = payments.find((p) => {
    const inst = paymentInstallments.find(
      (i) =>
        i.payment_method_id === Number(p.payment_method_id) &&
        i.installments === Number(p.installments)
    );
    return inst && inst.multiplier > 1;
  });

  const multiplier = interestMethod
    ? paymentInstallments.find(
        (i) =>
          i.payment_method_id === Number(interestMethod.payment_method_id) &&
          i.installments === Number(interestMethod.installments)
      )?.multiplier || 1
    : 1;

  const totalWithSurcharge = interestMethod
    ? baseAmountARS + saldo * (multiplier - 1)
    : baseAmountARS;

  const paidARS = payments.reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0
  );

  const remainingARS = Math.max(totalWithSurcharge - paidARS, 0);

  return {
    baseAmountARS,
    paidNoInterest,
    saldo,
    interestMethod,
    multiplier,
    totalWithSurcharge,
    paidARS,
    remainingARS,
  };
}
