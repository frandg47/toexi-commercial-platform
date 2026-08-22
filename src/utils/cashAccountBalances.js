export const todayDateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const isMovementAvailable = (movement) => {
  if (movement?.accreditation_status !== "pending") return true;
  return Boolean(movement.available_on && movement.available_on <= todayDateKey());
};

export const calculateAccountBalances = (accounts, movements) => {
  const totals = new Map();

  (movements || []).forEach((movement) => {
    if (!isMovementAvailable(movement)) return;

    const accountId = String(movement.account_id);
    const current = totals.get(accountId) || 0;
    const amount = Number(movement.amount || 0);
    totals.set(
      accountId,
      current +
        (movement.type === "income"
          ? amount
          : movement.type === "expense"
            ? -amount
            : 0),
    );
  });

  return (accounts || []).map((account) => ({
    ...account,
    current_balance:
      Number(account.initial_balance || 0) +
      (totals.get(String(account.id)) || 0),
  }));
};
