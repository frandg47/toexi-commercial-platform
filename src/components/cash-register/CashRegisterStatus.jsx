import { Badge } from "@/components/ui/badge";
import { IconCash, IconCircleCheck, IconCircleX } from "@tabler/icons-react";

const formatCurrency = (amount, currency) => {
  const opts = {
    ARS: { style: "currency", currency: "ARS" },
    USD: { style: "currency", currency: "USD" },
    USDT: { style: "currency", currency: "USD" },
  };
  return new Intl.NumberFormat("es-AR", opts[currency] || opts.ARS).format(amount || 0);
};

export default function CashRegisterStatus({ register, balance, onOpen, onClick, disabled, disabledReason }) {
  if (!register) {
    return (
      <div
        className={`flex items-center gap-3 rounded-lg border border-dashed p-4 transition-colors ${
          disabled
            ? "border-slate-300 bg-slate-50 cursor-not-allowed opacity-60"
            : "border-amber-300 bg-amber-50 cursor-pointer hover:bg-amber-100"
        }`}
        onClick={disabled ? undefined : onOpen}
      >
        <IconCash className={`h-5 w-5 ${disabled ? "text-slate-400" : "text-amber-600"}`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${disabled ? "text-slate-500" : "text-amber-800"}`}>
            {disabled && disabledReason ? disabledReason : "Sin caja abierta"}
          </p>
          {!disabled && (
            <p className="text-xs text-amber-600">Hacé clic para abrir la caja de hoy</p>
          )}
        </div>
        {!disabled && (
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            Abrir
          </Badge>
        )}
      </div>
    );
  }

  const isOpen = register.status === "open";

  const activeCurrencies = balance
    ? Object.entries(balance).filter(([, v]) => Math.abs(v || 0) > 0.009)
    : [];

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
        isOpen
          ? "border-green-200 bg-green-50 hover:bg-green-100"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
      }`}
      onClick={onClick}
    >
      {isOpen ? (
        <IconCash className="h-5 w-5 text-green-600" />
      ) : (
        <IconCircleCheck className="h-5 w-5 text-slate-500" />
      )}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${isOpen ? "text-green-800" : "text-slate-700"}`}>
            {isOpen ? "Caja abierta" : "Caja cerrada"}
          </p>
          <Badge
            variant="outline"
            className={
              isOpen
                ? "border-green-300 text-green-700"
                : "border-slate-300 text-slate-600"
            }
          >
            {register.currency}
          </Badge>
        </div>
        {isOpen ? (
          <div className="flex flex-wrap gap-3 mt-1">
            {activeCurrencies.length > 0 ? (
              activeCurrencies.map(([currency, amount]) => (
                <span
                  key={currency}
                  className={`text-xs font-medium ${amount >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {currency}: {formatCurrency(amount, currency)}
                </span>
              ))
            ) : (
              <span className="text-xs text-green-600">Saldo: $0</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Cerrada a las {new Date(register.closed_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      {isOpen ? (
        <Badge className="bg-green-600 hover:bg-green-700">
          <IconCircleCheck className="h-3 w-3 mr-1" />
          Abierta
        </Badge>
      ) : (
        <Badge variant="secondary">
          <IconCircleX className="h-3 w-3 mr-1" />
          Cerrada
        </Badge>
      )}
    </div>
  );
}
