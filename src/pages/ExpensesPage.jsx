import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContextProvider";
import { FEATURES } from "@/config/features";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  IconEdit,
  IconPlus,
  IconCalendar,
  IconArchiveOff,
  IconDotsVertical,
  IconCash,
  IconTrash,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatARS = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n || 0);

const formatUSDT = (n) =>
  `USDT ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;

const formatCurrencyByCode = (amount, currency) => {
  if (currency === "USD") return formatUSD(amount);
  if (currency === "USDT") return formatUSDT(amount);
  return formatARS(amount);
};

const formatTableAmount = (amount, currency) => {
  const resolvedCurrency = currency || "ARS";
  const formattedNumber = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

  return `${resolvedCurrency} $${formattedNumber}`;
};

const getLocalDateInputValue = (date = new Date()) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addInterval = (dateValue, amount, unit) => {
  if (!dateValue || !amount) return null;
  const date = parseDateValue(dateValue);
  if (!date) return null;
  const value = Number(amount);
  if (!value) return null;

  if (unit === "weeks") {
    date.setDate(date.getDate() + value * 7);
    return date;
  }
  if (unit === "months") {
    date.setMonth(date.getMonth() + value);
    return date;
  }
  date.setDate(date.getDate() + value);
  return date;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = parseDateValue(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return "-";
  return date.toLocaleDateString("es-AR");
};

const getDueDate = (expense) => {
  if (expense?.type !== "fixed") return null;
  const anchorDate = normalizeDate(expense?.expense_date);
  if (!anchorDate) return null;

  if (!expense?.frequency_value || !expense?.frequency_unit) {
    return anchorDate;
  }

  const paidAt = normalizeDate(expense?.last_paid_at);
  if (!paidAt) {
    return anchorDate;
  }

  let dueDate = new Date(anchorDate);
  let guard = 0;

  while (dueDate <= paidAt && guard < 500) {
    const nextDueDate = addInterval(
      dueDate,
      expense.frequency_value,
      expense.frequency_unit,
    );

    if (!nextDueDate) break;

    dueDate = normalizeDate(nextDueDate);
    guard += 1;
  }

  return dueDate;
};

const getFixedExpenseRowClassName = (isPaidCurrent, isOverdue) => {
  if (isPaidCurrent) {
    return "bg-sky-50/70 transition-colors hover:bg-sky-100/80 dark:bg-sky-950/25 dark:hover:bg-sky-900/35";
  }
  if (isOverdue) {
    return "bg-rose-50/80 transition-colors hover:bg-rose-100 dark:bg-rose-950/25 dark:hover:bg-rose-900/35";
  }
  return "bg-amber-50/70 transition-colors hover:bg-amber-100/80 dark:bg-amber-950/25 dark:hover:bg-amber-900/35";
};

const getFixedExpenseBadgeProps = (isPaidCurrent, isOverdue) => {
  if (isPaidCurrent) {
    return {
      label: "Pagado",
      className:
        "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-950/60",
    };
  }
  if (isOverdue) {
    return {
      label: "En deuda",
      className:
        "border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/60",
    };
  }
  return {
    label: "Pendiente",
    className:
      "border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/60",
  };
};

const normalizeExpenseCategory = (category, type) => {
  const trimmedCategory = category?.trim() || "";
  if (!trimmedCategory) return null;
  return type === "fixed" ? trimmedCategory.toUpperCase() : trimmedCategory;
};

const renderCategoryBadge = (category) => {
  if (!category) return "-";

  return (
    <Badge
      variant="outline"
      className="border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-100"
    >
      {category}
    </Badge>
  );
};

export default function ExpensesPage() {
  const { role, user } = useAuth();
  const isOwner = role?.toLowerCase() === "owner";

  const [section, setSection] = useState("expenses");
  const [loading, setLoading] = useState(false);
  const [fxRate, setFxRate] = useState(null);
  const [usdtRate, setUsdtRate] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [balanceMovements, setBalanceMovements] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    category: "all",
    account: "all",
    status: "all",
  });
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editForm, setEditForm] = useState({
    expense_date: "",
    amount: "",
    account_id: "",
    category: "",
    notes: "",
    frequency_value: "",
    frequency_unit: "months",
    last_paid_at: null,
  });
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payExpense, setPayExpense] = useState(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDeactivate, setExpenseToDeactivate] = useState(null);
  const [variableDeleteDialogOpen, setVariableDeleteDialogOpen] =
    useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);

  const [incomeForm, setIncomeForm] = useState({
    movement_date: new Date().toISOString().slice(0, 10),
    amount: "",
    account_id: "",
    category: "",
    notes: "",
  });

  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    amount: "",
    account_id: "",
    category: "",
    type: "variable",
    frequency_value: 1,
    frequency_unit: "months",
    notes: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    type: "expense",
    is_active: true,
  });

  const reloadExpenses = useCallback(async () => {
    const [fixedRes, variableRes] = await Promise.all([
      supabase
        .from("expenses")
        .select(
          "id, expense_date, amount, currency, amount_ars, category, type, notes, created_at, last_paid_at, frequency_value, frequency_unit, account_id, is_active, accounts(name, currency)",
        )
        .eq("type", "fixed")
        .eq("is_active", true)
        .order("expense_date", { ascending: false }),
      supabase
        .from("expenses")
        .select(
          "id, expense_date, amount, currency, amount_ars, category, type, notes, created_at, last_paid_at, frequency_value, frequency_unit, account_id, is_active, accounts(name, currency)",
        )
        .eq("type", "variable")
        .order("expense_date", { ascending: false })
        .limit(50),
    ]);

    if (fixedRes.error) {
      toast.error("No se pudieron cargar los gastos fijos", {
        description: fixedRes.error.message,
      });
    }

    if (variableRes.error) {
      toast.error("No se pudieron cargar los gastos variables", {
        description: variableRes.error.message,
      });
    }

    const fixedExpenses = fixedRes.data || [];
    const variableExpenses = variableRes.data || [];
    const combined = [...fixedExpenses, ...variableExpenses];

    combined.sort((a, b) => {
      if (a.type !== b.type) return a.type === "fixed" ? -1 : 1;
      return new Date(b.expense_date) - new Date(a.expense_date);
    });

    setExpenses(combined);
  }, []);

  const reloadBalanceMovements = useCallback(async () => {
    const movementsRes = await supabase
      .from("account_movements")
      .select("account_id, type, amount");

    if (movementsRes?.error) {
      toast.error("No se pudieron cargar los movimientos", {
        description: movementsRes.error.message,
      });
      return;
    }

    setBalanceMovements(movementsRes?.data || []);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [
        { data: rate },
        { data: usdt },
        { data: accs },
        categoriesRes,
        movementsRes,
      ] = await Promise.all([
        supabase
          .from("fx_rates")
          .select("rate")
          .eq("is_active", true)
          .eq("source", "blue")
          .maybeSingle(),
        supabase
          .from("fx_rates")
          .select("rate")
          .eq("is_active", true)
          .eq("source", "USDT")
          .maybeSingle(),
        supabase
          .from("accounts")
          .select(
            "id, name, currency, initial_balance, notes, include_in_balance, is_reference_capital, is_efectivo, is_caja_virtual",
          )
          .eq("is_reference_capital", false)
          .order("name", { ascending: true }),
        supabase
          .from("finance_categories")
          .select("id, name, type, is_active, created_at")
          .order("name", { ascending: true }),
        supabase.from("account_movements").select("account_id, type, amount"),
      ]);

      setFxRate(rate?.rate ? Number(rate.rate) : null);
      setUsdtRate(usdt?.rate ? Number(usdt.rate) : null);
      setAccounts(accs || []);
      if (movementsRes?.error) {
        toast.error("No se pudieron cargar los movimientos", {
          description: movementsRes.error.message,
        });
        setBalanceMovements([]);
      } else {
        setBalanceMovements(movementsRes?.data || []);
      }
      setCategories(categoriesRes?.data || []);
      await reloadExpenses();
      setLoading(false);
    };

    load();
  }, [reloadExpenses]);

  useEffect(() => {
    const checkRegister = async () => {
      const { data } = await supabase
        .from("cash_registers")
        .select("id")
        .eq("status", "open")
        .maybeSingle();
      setIsRegisterOpen(!!data);
    };
    checkRegister();
  }, []);

  const displayAccounts = useMemo(() => {
    if (isRegisterOpen) return accounts.filter((a) => !a.is_efectivo && !a.is_caja_virtual);
    return accounts;
  }, [accounts, isRegisterOpen]);

  const selectedAccount = useMemo(
    () => displayAccounts.find((a) => String(a.id) === String(expenseForm.account_id)),
    [displayAccounts, expenseForm.account_id],
  );
  const selectedIncomeAccount = useMemo(
    () => displayAccounts.find((a) => String(a.id) === String(incomeForm.account_id)),
    [displayAccounts, incomeForm.account_id],
  );
  const accountBalances = useMemo(() => {
    const totals = new Map();
    balanceMovements.forEach((movement) => {
      const entry = totals.get(movement.account_id) || {
        income: 0,
        expense: 0,
      };
      if (movement.type === "income") {
        entry.income += Number(movement.amount || 0);
      } else if (movement.type === "expense") {
        entry.expense += Number(movement.amount || 0);
      }
      totals.set(movement.account_id, entry);
    });

    return displayAccounts.map((acc) => {
      const totalsForAccount = totals.get(acc.id) || {
        income: 0,
        expense: 0,
      };
      const current =
        Number(acc.initial_balance || 0) +
        totalsForAccount.income -
        totalsForAccount.expense;
      return {
        ...acc,
        current_balance: current,
      };
    });
  }, [displayAccounts, balanceMovements]);

  const balanceByAccountId = useMemo(() => {
    return new Map(accountBalances.map((acc) => [acc.id, acc.current_balance]));
  }, [accountBalances]);
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense" && c.is_active),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "income" && c.is_active),
    [categories],
  );
  const payAccountOptions = useMemo(() => {
    if (!payExpense) return displayAccounts;
    if (!payExpense.currency) return displayAccounts;
    return displayAccounts.filter((acc) => acc.currency === payExpense.currency);
  }, [displayAccounts, payExpense]);

  const selectedPayAccount = useMemo(() => {
    return accountBalances.find(
      (acc) => String(acc.id) === String(payAccountId),
    );
  }, [accountBalances, payAccountId]);
  const payRequiredAmount = payExpense ? Number(payExpense.amount || 0) : 0;
  const selectedPayBalance = selectedPayAccount
    ? Number(selectedPayAccount.current_balance || 0)
    : 0;
  const isPayInsufficient = selectedPayAccount
    ? payRequiredAmount > selectedPayBalance
    : false;

  const fixedExpenses = useMemo(
    () => expenses.filter((exp) => exp.type === "fixed"),
    [expenses],
  );

  const variableExpenses = useMemo(
    () => expenses.filter((exp) => exp.type === "variable"),
    [expenses],
  );

  const applyFilters = useCallback(
    (list, includeStatus) => {
      return list.filter((exp) => {
        if (dateRange?.from) {
          if (new Date(exp.expense_date) < dateRange.from) return false;
        }
        if (dateRange?.to) {
          if (new Date(exp.expense_date) > dateRange.to) return false;
        }
        if (filters.category !== "all" && exp.category !== filters.category) {
          return false;
        }
        if (
          filters.account !== "all" &&
          String(exp.account_id) !== String(filters.account)
        ) {
          return false;
        }
        if (includeStatus && filters.status !== "all") {
          const dueDate = getDueDate(exp);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isPaidCurrent =
            exp.last_paid_at && dueDate && new Date(dueDate) > today;
          const isOverdue = dueDate && new Date(dueDate) <= today;
          if (filters.status === "paid" && !isPaidCurrent) return false;
          if (filters.status === "overdue" && !isOverdue) return false;
        }
        return true;
      });
    },
    [dateRange, filters],
  );

  const filteredFixedExpenses = useMemo(() => fixedExpenses, [fixedExpenses]);

  const filteredVariableExpenses = useMemo(
    () => applyFilters(variableExpenses, false),
    [applyFilters, variableExpenses],
  );

  const handleWeekFilter = () => {
    setDateRange({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 }),
    });
  };

  const handleCreateExpense = async () => {
    if (!expenseForm.expense_date) return toast.error("Selecciona una fecha");
    if (!expenseForm.category) return toast.error("Selecciona una categoria");

    const amount = Number(expenseForm.amount || 0);
    if (!amount || Number.isNaN(amount)) return toast.error("Monto invalido");

    // Verificar caja abierta si el módulo está activo (solo para gastos de caja)
    if (FEATURES.CASH_REGISTER && expenseForm.type === "variable") {
      const { data: cashRegister } = await supabase
        .from("cash_registers")
        .select("id")
        .eq("user_id", user?.id)
        .eq("register_date", new Date().toISOString().slice(0, 10))
        .eq("status", "open")
        .maybeSingle();

      if (!cashRegister) {
        return toast.error("Debe abrir la caja primero antes de registrar gastos", {
          description: "Andá a Dashboard > Caja para abrir la caja del día",
          duration: 6000,
        });
      }
    }

    let currency = "ARS";
    let rate = null;
    let accountId = null;

    if (expenseForm.type !== "fixed") {
      if (!selectedAccount) return toast.error("Selecciona una cuenta");
      currency = selectedAccount.currency || "ARS";
      rate =
        currency === "USD" ? fxRate : currency === "USDT" ? usdtRate : null;
      if (currency !== "ARS" && !rate) {
        return toast.error(`No hay cotizacion activa para ${currency}`);
      }
      accountId = selectedAccount.id;
    }

    const amountARS = currency === "ARS" ? amount : amount * rate;
    const normalizedCategory = normalizeExpenseCategory(
      expenseForm.category,
      expenseForm.type,
    );

    const { error } = await supabase.from("expenses").insert([
      {
        expense_date: expenseForm.expense_date,
        amount,
        currency,
        amount_ars: amountARS,
        account_id: accountId,
        category: normalizedCategory,
        type: expenseForm.type,
        notes: expenseForm.notes || null,
        frequency_value:
          expenseForm.type === "fixed"
            ? Number(expenseForm.frequency_value || 1)
            : null,
        frequency_unit:
          expenseForm.type === "fixed" ? expenseForm.frequency_unit : null,
        fx_rate_used: currency === "ARS" ? null : rate,
        is_active: true,
      },
    ]);

    if (error) {
      toast.error("No se pudo registrar el gasto", {
        description: error.message,
      });
      return;
    }

    if (expenseForm.type === "variable") {
      toast.success("Gasto variable creado correctamente", {
        description:
          "No se pago todavia. Debe pagarse desde la tabla de abajo.",
      });
    } else {
      toast.success("Gasto registrado");
    }
    setExpenseForm((f) => ({
      ...f,
      amount: "",
      category: "",
      notes: "",
      frequency_value: 1,
      frequency_unit: "months",
    }));
    await reloadExpenses();
    await reloadBalanceMovements();
  };

  const handleCreateIncome = async () => {
    if (!incomeForm.movement_date) return toast.error("Selecciona una fecha");
    if (!selectedIncomeAccount) return toast.error("Selecciona una cuenta");

    const amount = Number(incomeForm.amount || 0);
    if (!amount || Number.isNaN(amount)) return toast.error("Monto invalido");

    const currency = selectedIncomeAccount.currency || "ARS";
    const rate =
      currency === "USD" ? fxRate : currency === "USDT" ? usdtRate : null;
    if (currency !== "ARS" && !rate) {
      return toast.error(`No hay cotizacion activa para ${currency}`);
    }

    const amountARS = currency === "ARS" ? amount : amount * rate;
    const notes = [
      incomeForm.category ? `Categoria: ${incomeForm.category}` : "",
      incomeForm.notes,
    ]
      .filter(Boolean)
      .join(" | ");

    const { error } = await supabase.from("account_movements").insert([
      {
        movement_date: incomeForm.movement_date,
        account_id: selectedIncomeAccount.id,
        type: "income",
        amount,
        currency,
        amount_ars: amountARS,
        fx_rate_used: currency === "ARS" ? null : rate,
        related_table: "manual_income",
        notes: notes || null,
      },
    ]);

    if (error) {
      toast.error("No se pudo registrar el ingreso", {
        description: error.message,
      });
      return;
    }

    toast.success("Ingreso registrado");
    setIncomeForm((f) => ({
      ...f,
      amount: "",
      category: "",
      notes: "",
    }));
  };

  const handleOpenEdit = (expense) => {
    if (!expense) return;
    setEditingExpense(expense);
    setEditForm({
      expense_date: expense.expense_date || "",
      amount: expense.amount ?? "",
      account_id: String(expense.account_id || ""),
      category: expense.category || "",
      notes: expense.notes || "",
      frequency_value: expense.frequency_value ?? 1,
      frequency_unit: expense.frequency_unit || "months",
      last_paid_at: expense.last_paid_at || null,
    });
    setEditDialogOpen(true);
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense) return;
    if (!editForm.expense_date) return toast.error("Selecciona una fecha");

    const amount = Number(editForm.amount || 0);
    if (!amount || Number.isNaN(amount)) return toast.error("Monto invalido");

    const selectedEditAccount = displayAccounts.find(
      (acc) => String(acc.id) === String(editForm.account_id),
    );
    if (!selectedEditAccount) {
      return toast.error("Selecciona una cuenta");
    }

    const currency = selectedEditAccount.currency || "ARS";
    const rate =
      currency === "USD" ? fxRate : currency === "USDT" ? usdtRate : null;
    if (currency !== "ARS" && !rate) {
      return toast.error(`No hay cotizacion activa para ${currency}`);
    }
    const amountARS = currency === "ARS" ? amount : amount * rate;
    const normalizedCategory = normalizeExpenseCategory(
      editForm.category,
      editingExpense.type,
    );

    const payload = {
      expense_date: editForm.expense_date,
      amount,
      currency,
      amount_ars: amountARS,
      account_id: selectedEditAccount.id,
      category: normalizedCategory,
      notes: editForm.notes || null,
      frequency_value:
        editingExpense.type === "fixed"
          ? Number(editForm.frequency_value || 1)
          : null,
      frequency_unit:
        editingExpense.type === "fixed" ? editForm.frequency_unit : null,
      last_paid_at: editForm.last_paid_at,
    };

    const { error } = await supabase
      .from("expenses")
      .update(payload)
      .eq("id", editingExpense.id);

    if (error) {
      toast.error("No se pudo actualizar el gasto", {
        description: error.message,
      });
      return;
    }

    toast.success("Gasto actualizado");
    setEditDialogOpen(false);
    setEditingExpense(null);
    await reloadExpenses();
    await reloadBalanceMovements();
  };

  const handleOpenPayDialog = (expense) => {
    if (!expense) return;
    setPayExpense(expense);
    setPayAccountId(expense.account_id ? String(expense.account_id) : "");
    setPayDialogOpen(true);
  };

  const handleConfirmPaid = async () => {
    if (!payExpense) return;
    if (!payAccountId) {
      toast.error("Selecciona una cuenta");
      return;
    }

    const selected = accountBalances.find(
      (acc) => String(acc.id) === String(payAccountId),
    );
    if (!selected) {
      toast.error("Selecciona una cuenta valida");
      return;
    }

    const requiredAmount = Number(payExpense.amount || 0);
    const available =
      balanceByAccountId.get(selected.id) ?? selected.current_balance ?? 0;
    if (requiredAmount > Number(available || 0)) {
      toast.error("Saldo insuficiente");
      return;
    }

    const localToday = getLocalDateInputValue();
    const localPaidAt = new Date(`${localToday}T12:00:00`).toISOString();

    const { error } = await supabase
      .from("expenses")
      .update({
        last_paid_at: localPaidAt,
        account_id: selected.id,
      })
      .eq("id", payExpense.id);

    if (error) {
      toast.error("No se pudo marcar como pagado", {
        description: error.message,
      });
      return;
    }

    toast.success("Gasto marcado como pagado");
    setPayDialogOpen(false);
    setPayExpense(null);
    setPayAccountId("");
    await reloadExpenses();
    await reloadBalanceMovements();
  };

  const handleCreateCategory = async () => {
    const name = categoryForm.name.trim();
    if (!name) return toast.error("Ingresa un nombre de categoria");

    const { error } = await supabase.from("finance_categories").insert([
      {
        name,
        type: categoryForm.type,
        is_active: categoryForm.is_active,
      },
    ]);

    if (error) {
      toast.error("No se pudo crear la categoria", {
        description: error.message,
      });
      return;
    }

    toast.success("Categoria creada");
    setCategoryForm({ name: "", type: "expense", is_active: true });
    setCategoryDialogOpen(false);
    const { data } = await supabase
      .from("finance_categories")
      .select("id, name, type, is_active, created_at")
      .order("name", { ascending: true });
    setCategories(data || []);
  };

  const handleRequestDeactivateFixedExpense = (expense) => {
    if (!expense || expense.type !== "fixed") return;
    setExpenseToDeactivate(expense);
    setDeleteDialogOpen(true);
  };

  const handleDeactivateFixedExpense = async () => {
    if (!expenseToDeactivate || expenseToDeactivate.type !== "fixed") return;

    const { error } = await supabase
      .from("expenses")
      .update({ is_active: false })
      .eq("id", expenseToDeactivate.id);

    if (error) {
      toast.error("No se pudo desactivar el gasto fijo", {
        description: error.message,
      });
      return;
    }

    toast.success("Gasto fijo desactivado");
    setDeleteDialogOpen(false);
    setExpenseToDeactivate(null);
    await reloadExpenses();
  };

  const handleRequestDeleteVariableExpense = (expense) => {
    if (!expense || expense.type !== "variable") return;
    setExpenseToDelete(expense);
    setVariableDeleteDialogOpen(true);
  };

  const handleDeleteVariableExpense = async () => {
    if (!expenseToDelete || expenseToDelete.type !== "variable") return;

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseToDelete.id);

    if (error) {
      toast.error("No se pudo eliminar el gasto variable", {
        description: error.message,
      });
      return;
    }

    toast.success("Gasto variable eliminado");
    setVariableDeleteDialogOpen(false);
    setExpenseToDelete(null);
    await reloadExpenses();
    await reloadBalanceMovements();
  };

  const handleCancelFixedExpensePayment = async (
    expenseParam = editingExpense,
  ) => {
    const expense = expenseParam;
    if (!expense || expense.type !== "fixed") return;
    if (!expense.last_paid_at) return;
    if (!expense.account_id) {
      toast.error("No se encontro la cuenta del pago original");
      return;
    }

    const localToday = getLocalDateInputValue();
    const { data: originalExpenseMovement, error: originalMovementError } =
      await supabase
        .from("account_movements")
        .select(
          "movement_date, account_id, amount, currency, amount_ars, fx_rate_used, notes",
        )
        .eq("related_table", "expenses")
        .eq("related_id", expense.id)
        .maybeSingle();

    if (originalMovementError) {
      toast.error("No se pudo recuperar el movimiento original del gasto", {
        description: originalMovementError.message,
      });
      return;
    }

    if (originalExpenseMovement) {
      const { error: historyMovementError } = await supabase
        .from("account_movements")
        .insert([
          {
            movement_date: originalExpenseMovement.movement_date || localToday,
            account_id: originalExpenseMovement.account_id,
            type: "expense",
            amount: Number(
              originalExpenseMovement.amount || expense.amount || 0,
            ),
            currency: originalExpenseMovement.currency || expense.currency,
            amount_ars: Number(
              originalExpenseMovement.amount_ars || expense.amount_ars || 0,
            ),
            fx_rate_used: originalExpenseMovement.fx_rate_used || null,
            related_table: "expense_payment_history",
            related_id: expense.id,
            notes:
              originalExpenseMovement.notes ||
              `Pago historico de gasto fijo: ${expense.category || "Sin categoria"}`,
          },
        ]);

      if (historyMovementError) {
        toast.error("No se pudo preservar el movimiento original del gasto", {
          description: historyMovementError.message,
        });
        return;
      }
    }

    const { error: movementError } = await supabase
      .from("account_movements")
      .insert([
        {
          movement_date: localToday,
          account_id: expense.account_id,
          type: "income",
          amount: Number(expense.amount || 0),
          currency: expense.currency,
          amount_ars: Number(expense.amount_ars || 0),
          related_table: "expense_reversal",
          related_id: expense.id,
          notes: `Anulacion de pago de gasto fijo: ${expense.category || "Sin categoria"}`,
        },
      ]);

    if (movementError) {
      toast.error("No se pudo revertir el movimiento del gasto", {
        description: movementError.message,
      });
      return;
    }

    const { error: expenseError } = await supabase
      .from("expenses")
      .update({ last_paid_at: null, account_id: null })
      .eq("id", expense.id);

    if (expenseError) {
      toast.error(
        "Se genero el movimiento inverso pero no se pudo anular el pago",
        {
          description: expenseError.message,
        },
      );
      return;
    }

    toast.success("Pago anulado");
    if (editingExpense?.id === expense.id) {
      setEditForm((f) => ({ ...f, last_paid_at: null }));
      setEditDialogOpen(false);
      setEditingExpense(null);
    }
    await reloadExpenses();
    await reloadBalanceMovements();
  };

  if (!isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${
            section === "expenses" ? "border-primary/60" : ""
          }`}
          onClick={() => setSection("expenses")}
        >
          <CardHeader>
            <CardTitle>Gastos</CardTitle>
          </CardHeader>
        </Card>
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${
            section === "income" ? "border-primary/60" : ""
          }`}
          onClick={() => setSection("income")}
        >
          <CardHeader>
            <CardTitle>Ingresos</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {section === "expenses" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Registrar gasto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    {expenseForm.type === "fixed"
                      ? "Fecha de vencimiento"
                      : "Fecha"}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-between gap-2 font-normal"
                      >
                        <span>
                          {expenseForm.expense_date
                            ? formatDateOnly(expenseForm.expense_date)
                            : "Seleccionar fecha"}
                        </span>
                        <IconCalendar className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={parseDateValue(expenseForm.expense_date) ?? undefined}
                        onSelect={(date) =>
                          setExpenseForm((f) => ({
                            ...f,
                            expense_date: date
                              ? getLocalDateInputValue(date)
                              : "",
                          }))
                        }
                        locale={es}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Monto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Monto"
                    value={expenseForm.amount}
                    onChange={(e) =>
                      setExpenseForm((f) => ({ ...f, amount: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    {expenseForm.type === "fixed" ? "Cuenta al pagar" : "Cuenta"}
                  </Label>
                  <Select
                    value={expenseForm.account_id}
                    onValueChange={(value) =>
                      setExpenseForm((f) => ({ ...f, account_id: value }))
                    }
                    disabled={expenseForm.type === "fixed"}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          expenseForm.type === "fixed"
                            ? "Cuenta (al pagar)"
                            : "Cuenta"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {displayAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={String(acc.id)}>
                          {acc.name} ({acc.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={expenseForm.category}
                    onValueChange={(value) =>
                      setExpenseForm((f) => ({ ...f, category: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {expenseCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCategoryDialogOpen(true)}
                    aria-label="Agregar categoria"
                  >
                    <IconPlus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={expenseForm.type === "fixed"}
                    onCheckedChange={(checked) =>
                      setExpenseForm((f) => ({
                        ...f,
                        type: checked ? "fixed" : "variable",
                        account_id: checked ? "" : f.account_id,
                      }))
                    }
                  />
                  <span className="text-sm">Es fijo</span>
                </div>
                <Input
                  placeholder="Moneda"
                  value={selectedAccount?.currency || "--"}
                  readOnly
                />
              </div>
              {expenseForm.type === "fixed" && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Renovacion cada
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Cada cuanto"
                      value={expenseForm.frequency_value}
                      onChange={(e) =>
                        setExpenseForm((f) => ({
                          ...f,
                          frequency_value: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Periodo
                    </Label>
                    <Select
                      value={expenseForm.frequency_unit}
                      onValueChange={(value) =>
                        setExpenseForm((f) => ({
                          ...f,
                          frequency_unit: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Periodo" />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]">
                        <SelectItem value="days">Dias</SelectItem>
                        <SelectItem value="weeks">Semanas</SelectItem>
                        <SelectItem value="months">Meses</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Siguiente vencimiento
                    </Label>
                    <Input
                      value={formatDateOnly(
                        addInterval(
                          expenseForm.expense_date,
                          expenseForm.frequency_value || 1,
                          expenseForm.frequency_unit,
                        ) || expenseForm.expense_date,
                      )}
                      readOnly
                    />
                  </div>
                </div>
              )}

              <Textarea
                placeholder="Notas"
                value={expenseForm.notes}
                onChange={(e) =>
                  setExpenseForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
              <Button onClick={handleCreateExpense} disabled={loading}>
                Guardar gasto
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gastos fijos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha ultimo pago</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Periodo</TableHead>
                      <TableHead>Vence</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFixedExpenses.map((exp) => {
                      const dueDate = getDueDate(exp);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isPaidCurrent =
                        exp.last_paid_at &&
                        dueDate &&
                        new Date(dueDate) > today;
                      const isOverdue = dueDate && new Date(dueDate) <= today;

                      return (
                        <TableRow
                          key={exp.id}
                          className={getFixedExpenseRowClassName(
                            isPaidCurrent,
                            isOverdue,
                          )}
                        >
                          <TableCell>
                            {formatDateOnly(exp.last_paid_at)}
                          </TableCell>
                          <TableCell>
                            {exp.accounts?.name || "Sin cuenta"}
                          </TableCell>
                          <TableCell>
                            {renderCategoryBadge(exp.category)}
                          </TableCell>
                          <TableCell>
                            {exp.frequency_value
                              ? `${exp.frequency_value} ${
                                  exp.frequency_unit === "weeks"
                                    ? "semanas"
                                    : exp.frequency_unit === "months"
                                      ? "meses"
                                      : "dias"
                                }`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {formatDateOnly(getDueDate(exp))}
                          </TableCell>
                          <TableCell>
                            {formatTableAmount(exp.amount, exp.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                getFixedExpenseBadgeProps(
                                  isPaidCurrent,
                                  isOverdue,
                                ).className
                              }
                            >
                              {
                                getFixedExpenseBadgeProps(
                                  isPaidCurrent,
                                  isOverdue,
                                ).label
                              }
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-muted"
                                >
                                  <IconDotsVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:hover:border-sky-800 dark:hover:bg-sky-950/50 dark:hover:text-sky-100"
                                  onClick={() => handleOpenEdit(exp)}
                                >
                                  <IconEdit className="h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className={
                                    isPaidCurrent
                                      ? "hover:bg-sky-50 hover:text-sky-900 dark:hover:bg-sky-950/50 dark:hover:text-sky-100"
                                      : "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 dark:hover:border-amber-800 dark:hover:bg-amber-950/50 dark:hover:text-amber-100"
                                  }
                                  onClick={() =>
                                    isPaidCurrent
                                      ? handleCancelFixedExpensePayment(exp)
                                      : handleOpenPayDialog(exp)
                                  }
                                >
                                  <IconCash className="h-4 w-4" />
                                  {isPaidCurrent ? "Anular pago" : "Pagar"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    handleRequestDeactivateFixedExpense(exp)
                                  }
                                >
                                  <IconArchiveOff className="h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredFixedExpenses.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground"
                        >
                          No hay gastos registrados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Fecha</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex items-center gap-2 min-w-[220px]"
                      >
                        <IconCalendar className="h-4 w-4" />
                        {dateRange?.from && dateRange?.to
                          ? `${dateRange.from.toLocaleDateString(
                              "es-AR",
                            )} - ${dateRange.to.toLocaleDateString("es-AR")}`
                          : "Filtrar por fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-3" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={setDateRange}
                        locale={es}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Semana</span>
                  <Button variant="outline" onClick={handleWeekFilter}>
                    Semana actual
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 md:justify-end">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    Categoria
                  </span>
                  <Select
                    value={filters.category}
                    onValueChange={(value) =>
                      setFilters((f) => ({ ...f, category: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="all">Todas</SelectItem>
                      {expenseCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Cuenta</span>
                  <Select
                    value={filters.account}
                    onValueChange={(value) =>
                      setFilters((f) => ({ ...f, account: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Cuenta" />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="all">Todas</SelectItem>
                      {displayAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={String(acc.id)}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Estado</span>
                  <Select
                    value={filters.status}
                    onValueChange={(value) =>
                      setFilters((f) => ({ ...f, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="overdue">En deuda</SelectItem>
                      <SelectItem value="paid">Pagados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Gastos variables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVariableExpenses.map((exp) => (
                      <TableRow
                        key={exp.id}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <TableCell>{exp.expense_date}</TableCell>
                        <TableCell>{exp.accounts?.name || "Cuenta"}</TableCell>
                        <TableCell>
                          {renderCategoryBadge(exp.category)}
                        </TableCell>
                        <TableCell>
                          {formatTableAmount(exp.amount, exp.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-muted"
                              >
                                <IconDotsVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:hover:border-sky-800 dark:hover:bg-sky-950/50 dark:hover:text-sky-100"
                                onClick={() => handleOpenEdit(exp)}
                              >
                                <IconEdit className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                className="hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-100"
                                onClick={() =>
                                  handleRequestDeleteVariableExpense(exp)
                                }
                              >
                                <IconTrash className="h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredVariableExpenses.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          No hay gastos registrados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {section === "income" && (
        <Card>
          <CardHeader>
            <CardTitle>Ingresos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                type="date"
                value={incomeForm.movement_date}
                onChange={(e) =>
                  setIncomeForm((f) => ({
                    ...f,
                    movement_date: e.target.value,
                  }))
                }
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Monto"
                value={incomeForm.amount}
                onChange={(e) =>
                  setIncomeForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
              <Select
                value={incomeForm.account_id}
                onValueChange={(value) =>
                  setIncomeForm((f) => ({ ...f, account_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cuenta" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {displayAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.name} ({acc.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-2">
                <Select
                  value={incomeForm.category}
                  onValueChange={(value) =>
                    setIncomeForm((f) => ({ ...f, category: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {incomeCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCategoryDialogOpen(true)}
                  aria-label="Agregar categoria"
                >
                  <IconPlus className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Moneda"
                value={selectedIncomeAccount?.currency || "--"}
                readOnly
              />
            </div>
            <Textarea
              placeholder="Notas"
              value={incomeForm.notes}
              onChange={(e) =>
                setIncomeForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
            <Button onClick={handleCreateIncome} disabled={loading}>
              Guardar ingreso
            </Button>
          </CardContent>
        </Card>
      )}

      {/* <Card>
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell>{cat.name}</TableCell>
                    <TableCell>{cat.type === "income" ? "Ingreso" : "Gasto"}</TableCell>
                    <TableCell>{cat.is_active ? "Si" : "No"}</TableCell>
                  </TableRow>
                ))}
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      No hay categorias creadas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card> */}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">
                {editingExpense?.type === "fixed"
                  ? "Fecha de vencimiento"
                  : "Fecha"}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-between gap-2 font-normal"
                  >
                    <span>
                      {editForm.expense_date
                        ? formatDateOnly(editForm.expense_date)
                        : "Seleccionar fecha"}
                    </span>
                    <IconCalendar className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDateValue(editForm.expense_date) ?? undefined}
                    onSelect={(date) =>
                      setEditForm((f) => ({
                        ...f,
                        expense_date: date ? getLocalDateInputValue(date) : "",
                      }))
                    }
                    locale={es}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Monto</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Monto"
                value={editForm.amount}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <Select
                value={editForm.account_id}
                onValueChange={(value) =>
                  setEditForm((f) => ({ ...f, account_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cuenta" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {displayAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.name} ({acc.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select
                value={editForm.category}
                onValueChange={(value) =>
                  setEditForm((f) => ({ ...f, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingExpense?.type === "fixed" && (
              <>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Renovacion cada
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Cada cuanto"
                    value={editForm.frequency_value}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        frequency_value: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Periodo
                  </Label>
                  <Select
                    value={editForm.frequency_unit}
                    onValueChange={(value) =>
                      setEditForm((f) => ({
                        ...f,
                        frequency_unit: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Periodo" />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      <SelectItem value="days">Dias</SelectItem>
                      <SelectItem value="weeks">Semanas</SelectItem>
                      <SelectItem value="months">Meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">
                    Siguiente vencimiento
                  </Label>
                  <Input
                    value={formatDateOnly(
                      addInterval(
                        editForm.expense_date,
                        editForm.frequency_value || 1,
                        editForm.frequency_unit,
                      ) || editForm.expense_date,
                    )}
                    readOnly
                  />
                </div>
              </>
            )}
          </div>
          <Textarea
            placeholder="Notas"
            value={editForm.notes}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, notes: e.target.value }))
            }
          />
          <DialogFooter>
            {editingExpense?.type === "fixed" &&
              editingExpense?.last_paid_at && (
                <Button
                  variant="outline"
                  onClick={handleCancelFixedExpensePayment}
                >
                  Anular pago
                </Button>
              )}
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateExpense}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={payDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPayDialogOpen(false);
            setPayExpense(null);
            setPayAccountId("");
          }
        }}
      >
        <DialogContent className="w-[90vw] sm:max-w-lg max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Marcar gasto como pagado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {payExpense && (
              <div className="text-sm text-muted-foreground">
                <div>
                  <strong>Categoria:</strong> {payExpense.category || "-"}
                </div>
                <div>
                  <strong>Monto:</strong>{" "}
                  {formatCurrencyByCode(payRequiredAmount, payExpense.currency)}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Cuenta</Label>
              <Select value={payAccountId} onValueChange={setPayAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {payAccountOptions.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.name} ({acc.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {payAccountOptions.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-300">
                  No hay cuentas disponibles con la misma moneda.
                </p>
              )}
              {selectedPayAccount && (
                <p className="text-xs text-muted-foreground">
                  Saldo disponible:{" "}
                  {formatCurrencyByCode(
                    selectedPayBalance,
                    selectedPayAccount.currency,
                  )}
                </p>
              )}
              {isPayInsufficient && (
                <p className="text-xs text-red-600 dark:text-red-300">
                  Saldo insuficiente
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayDialogOpen(false);
                setPayExpense(null);
                setPayAccountId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmPaid}
              disabled={
                !payAccountId ||
                payAccountOptions.length === 0 ||
                isPayInsufficient
              }
            >
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setExpenseToDeactivate(null);
          }
        }}
      >
        <DialogContent className="w-[90vw] sm:max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar gasto fijo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Seguro desea eliminar este gasto fijo?</p>
            <p>
              Se desactivara{" "}
              <span className="font-medium text-foreground">
                {expenseToDeactivate?.category || "Sin categoria"}
              </span>{" "}
              y se conservaran sus movimientos vinculados.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setExpenseToDeactivate(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivateFixedExpense}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={variableDeleteDialogOpen}
        onOpenChange={(open) => {
          setVariableDeleteDialogOpen(open);
          if (!open) {
            setExpenseToDelete(null);
          }
        }}
      >
        <DialogContent className="w-[90vw] sm:max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar gasto variable</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Se eliminara de forma definitiva{" "}
              <span className="font-medium text-foreground">
                {expenseToDelete?.category || "Sin categoria"}
              </span>{" "}
              y tambien se quitara su movimiento vinculado.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVariableDeleteDialogOpen(false);
                setExpenseToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteVariableExpense}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="w-[90vw] sm:max-w-xl md:max-w-2xl max-h-[85svh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Nueva categoria</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Nombre"
              value={categoryForm.name}
              onChange={(e) =>
                setCategoryForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <Select
              value={categoryForm.type}
              onValueChange={(value) =>
                setCategoryForm((f) => ({ ...f, type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="expense">Gasto</SelectItem>
                <SelectItem value="income">Ingreso</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                checked={categoryForm.is_active}
                onCheckedChange={(checked) =>
                  setCategoryForm((f) => ({ ...f, is_active: checked }))
                }
              />
              <span className="text-sm">Activa</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateCategory} disabled={loading}>
              Crear categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
