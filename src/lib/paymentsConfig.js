// src/lib/paymentsConfig.js

// Métodos de pago de ejemplo – REEMPLAZÁ con los tuyos reales
export const paymentMethods = [
  { id: 1, name: "Efectivo", multiplier: 1 },
  { id: 2, name: "Transferencia", multiplier: 1 },
  { id: 3, name: "Tarjeta Naranja", multiplier: 1 },
  { id: 4, name: "Macro", multiplier: 1 },
  { id: 5, name: "Tarjetas Bancarizadas", multiplier: 1 },
];

// Tabla de cuotas por método – también ejemplo
const installmentsTable = [
  { id: 1, payment_method_id: 3, installments: 3, multiplier: 1.25 },
  { id: 2, payment_method_id: 3, installments: 6, multiplier: 1.4 },
  { id: 3, payment_method_id: 3, installments: 12, multiplier: 1.95 },
];

// 🚨 FUNCIÓN PURA, SIN JSX
export function getInstallmentsForMethod(payment_method_id) {
  if (!payment_method_id) return [];
  return installmentsTable.filter(
    (inst) => String(inst.payment_method_id) === String(payment_method_id)
  );
}
