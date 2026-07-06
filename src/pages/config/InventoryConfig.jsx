import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContextProvider";
import {
  IconAlertTriangle,
  IconBox,
  IconDotsVertical,
  IconHistory,
  IconPencil,
  IconRefresh,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react";

const STATUS_LABELS = {
  available: "Disponible",
  reserved: "Reservada",
  sold: "Vendida",
  defective: "Defectuosa",
  in_repair: "En reparacion",
  returned_available: "Devuelta disponible",
  returned_defective: "Devuelta defectuosa",
  warranty_hold: "Retenida por garantia",
  voided: "Anulada",
};

const STATUS_BADGE_CLASS = {
  available:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  reserved:
    "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  sold: "border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200",
  defective:
    "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  in_repair:
    "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  returned_available:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  returned_defective:
    "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  warranty_hold:
    "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200",
  voided:
    "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
};

const EVENT_LABELS = {
  purchase_received: "Compra registrada",
  purchase_voided: "Compra anulada",
  sale_created: "Venta registrada",
  sale_voided: "Venta anulada",
  aftersales_registered: "Enviado a postventa",
  aftersales_status_changed: "Cambio en postventa",
  aftersales_sale_created: "Venta desde postventa",
  warranty_returned: "Ingreso por garantia",
  warranty_replacement_delivered: "Reemplazo entregado",
  manual_serial_stock_initialized: "Carga manual de seriales",
};

const TRACKING_LABELS = {
  quantity: "Por cantidad",
  serial: "Serializado",
};

const formatVariantLabel = (variant) => {
  if (!variant) return "-";
  return [
    variant.products?.name,
    variant.variant_name,
    variant.color ? `(${variant.color})` : null,
    variant.storage ? `${variant.storage}GB` : null,
    variant.ram ? `${variant.ram} RAM` : null,
  ]
    .filter(Boolean)
    .join(" ");
};

const formatCustomerName = (customer) => {
  if (!customer) return "-";
  return [customer.name, customer.last_name].filter(Boolean).join(" ") || "-";
};

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "-";
  }
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const getStatusLabel = (status) => STATUS_LABELS[status] || status || "-";

const getEventLabel = (eventType) =>
  EVENT_LABELS[eventType] || eventType || "-";

const normalizeIdentifierKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export default function InventoryConfig() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [variants, setVariants] = useState([]);
  const [units, setUnits] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    unitStatus: "available",
  });
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [unitEvents, setUnitEvents] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [serialLoadDialogOpen, setSerialLoadDialogOpen] = useState(false);
  const [serialLoadVariant, setSerialLoadVariant] = useState(null);
  const [serialIdentifiersText, setSerialIdentifiersText] = useState("");
  const [serialLoadSubmitting, setSerialLoadSubmitting] = useState(false);

  const [editUnitDialogOpen, setEditUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editIdentifierValue, setEditIdentifierValue] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateUnits, setDuplicateUnits] = useState([]);
  const [pendingIdentifier, setPendingIdentifier] = useState("");
  const [assignToCurrent, setAssignToCurrent] = useState(false);

  const [unitsPage, setUnitsPage] = useState(1);
  const unitsPageSize = 30;
  const [unitsTotalCount, setUnitsTotalCount] = useState(0);
  const [allUnitsForCount, setAllUnitsForCount] = useState([]);

  const [summaryPage, setSummaryPage] = useState(1);
  const summaryPageSize = 30;
  const [summaryTotalCount, setSummaryTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState("units");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchInventoryData = useCallback(
    async (loadUnits = true) => {
      setRefreshing(true);

      const from = (unitsPage - 1) * unitsPageSize;
      const to = from + unitsPageSize - 1;

      const [variantsResponse, unitsResponse, allUnitsResponse] =
        await Promise.all([
          supabase
            .from("product_variants")
            .select(
              "id, variant_name, color, storage, ram, stock, stock_defective, updated_at, products(id, name, active, inventory_tracking_mode, brands(name), categories(name))",
            ),
          loadUnits
            ? (() => {
                let query = supabase
                  .from("inventory_units")
                  .select(
                    "id, variant_id, purchase_id, purchase_item_id, sale_id, sale_item_id, warranty_exchange_id, identifier_value, status, received_at, sold_at, returned_at, notes, created_at, updated_at, variant:product_variants!inventory_units_variant_id_fkey(id, variant_name, color, storage, ram, products(id, name, inventory_tracking_mode, brands(name), categories(name))), purchase:purchases!inventory_units_purchase_id_fkey(id, purchase_date, providers(name)), sale:sales!inventory_units_sale_id_fkey(id, sale_date, customers(name, last_name))",
                    { count: "exact" },
                  )
                  .order("identifier_value", {
                    ascending: true,
                    nullsFirst: false,
                  })
                  .range(from, to);

                if (debouncedSearch) {
                  const term = `%${debouncedSearch}%`;
                  query = query.or(`identifier_value.ilike.${term}`);
                }

                if (filters.unitStatus !== "all") {
                  query = query.eq("status", filters.unitStatus);
                }

                return query;
              })()
            : Promise.resolve({ data: units, count: unitsTotalCount }),
          supabase
            .from("inventory_units")
            .select("id, variant_id, status", { count: "exact" }),
        ]);

      if (variantsResponse.error || unitsResponse.error) {
        console.error(variantsResponse.error || unitsResponse.error);
        toast.error("Error", {
          description: "No se pudo cargar la nueva seccion de inventario.",
        });
        setRefreshing(false);
        setLoading(false);
        return;
      }

      const nextVariants = [...(variantsResponse.data || [])].sort((a, b) => {
        const left = formatVariantLabel(a);
        const right = formatVariantLabel(b);
        return left.localeCompare(right);
      });

      setUnitsTotalCount(unitsResponse.count || 0);
      setAllUnitsForCount(allUnitsResponse.data || []);

      const nextUnits = [...(unitsResponse.data || [])].sort((a, b) => {
        const left = `${a.variant?.products?.name || ""} ${a.variant?.variant_name || ""} ${a.identifier_value || ""}`;
        const right = `${b.variant?.products?.name || ""} ${b.variant?.variant_name || ""} ${b.identifier_value || ""}`;
        return left.localeCompare(right);
      });

      setVariants(nextVariants);
      setUnits(nextUnits);
      setRefreshing(false);
      setLoading(false);
    },
    [unitsPage, unitsPageSize, filters.unitStatus, debouncedSearch],
  );

  useEffect(() => {
    fetchInventoryData();
  }, [fetchInventoryData]);

  useEffect(() => {
    setUnitsPage(1);
    setSummaryPage(1);
  }, [debouncedSearch, filters.unitStatus]);

  useEffect(() => {
    fetchInventoryData(true);
  }, [unitsPage, debouncedSearch]);

  const openHistory = useCallback(async (unit) => {
    if (!unit?.id) return;

    setSelectedUnit(unit);
    setHistoryOpen(true);
    setHistoryLoading(true);

    const { data, error } = await supabase
      .from("inventory_unit_events")
      .select(
        "id, event_type, from_status, to_status, related_table, related_id, notes, payload, created_at",
      )
      .eq("inventory_unit_id", unit.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Error", {
        description: "No se pudo cargar el historial de la unidad.",
      });
      setUnitEvents([]);
    } else {
      setUnitEvents(data || []);
    }

    setHistoryLoading(false);
  }, []);

  const stats = useMemo(() => {
    const variantCount = variants.length;
    const availableStock = variants.reduce(
      (total, variant) => total + Number(variant.stock || 0),
      0,
    );
    const defectiveStock = variants.reduce(
      (total, variant) => total + Number(variant.stock_defective || 0),
      0,
    );
    const serialUnits = allUnitsForCount.length;

    return { variantCount, availableStock, defectiveStock, serialUnits };
  }, [variants, units]);

  const unitCountsByVariant = useMemo(
    () =>
      allUnitsForCount.reduce((acc, unit) => {
        const variantId = unit.variant_id;
        if (!variantId) return acc;
        if (!acc[variantId]) {
          acc[variantId] = {
            total: 0,
            available: 0,
            sold: 0,
            defective: 0,
            inRepair: 0,
            other: 0,
          };
        }

        acc[variantId].total += 1;
        if (unit.status === "available") acc[variantId].available += 1;
        else if (unit.status === "sold") acc[variantId].sold += 1;
        else if (["defective", "returned_defective"].includes(unit.status))
          acc[variantId].defective += 1;
        else if (unit.status === "in_repair") acc[variantId].inRepair += 1;
        else acc[variantId].other += 1;
        return acc;
      }, {}),
    [allUnitsForCount],
  );

  const serialVariantsWithoutUnits = useMemo(
    () =>
      variants
        .filter(
          (variant) =>
            (variant.products?.inventory_tracking_mode || "quantity") ===
            "serial",
        )
        .map((variant) => {
          const counts = unitCountsByVariant[variant.id] || {
            available: 0,
            sold: 0,
            defective: 0,
            inRepair: 0,
            other: 0,
            total: 0,
          };

          return {
            ...variant,
            unitCounts: counts,
            missingUnits: Math.max(
              Number(variant.stock || 0) - counts.available,
              0,
            ),
            excessUnits: Math.max(
              counts.available - Number(variant.stock || 0),
              0,
            ),
          };
        })
        .filter(
          (variant) => variant.missingUnits > 0 || variant.excessUnits > 0,
        ),
    [unitCountsByVariant, variants],
  );

  const summaryRows = useMemo(() => {
    const query = normalizeText(debouncedSearch);

    return variants
      .filter((variant) => {
        const stock = Number(variant.stock || 0);
        if (stock <= 0) return false;

        const searchable = normalizeText(
          [
            variant.products?.name,
            variant.variant_name,
            variant.color,
            variant.storage,
            variant.ram,
            variant.products?.brands?.name,
            variant.products?.categories?.name,
          ]
            .filter(Boolean)
            .join(" "),
        );

        return !query || searchable.includes(query);
      })
      .map((variant) => ({
        ...variant,
        unitCounts: unitCountsByVariant[variant.id] || {
          total: 0,
          available: 0,
          sold: 0,
          defective: 0,
          inRepair: 0,
          other: 0,
        },
      }));
  }, [debouncedSearch, unitCountsByVariant, variants]);

  useEffect(() => {
    setSummaryTotalCount(summaryRows.length);
  }, [summaryRows]);

  const paginatedSummaryRows = useMemo(() => {
    const from = (summaryPage - 1) * summaryPageSize;
    return summaryRows.slice(from, from + summaryPageSize);
  }, [summaryRows, summaryPage, summaryPageSize]);

  const filteredUnits = units;

  const openSerialLoadDialog = useCallback((variant) => {
    setSerialLoadVariant(variant);
    setSerialIdentifiersText("");
    setSerialLoadDialogOpen(true);
  }, []);

  const handleLoadSerialUnits = useCallback(async () => {
    if (!serialLoadVariant) return;

    const identifiers = serialIdentifiersText
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (identifiers.length === 0) {
      toast.warning("Faltan seriales", {
        description: "Ingresá al menos un IMEI/SN, uno por linea.",
      });
      return;
    }

    if (identifiers.length !== serialLoadVariant.missingUnits) {
      toast.warning("Cantidad incorrecta", {
        description: `Debes cargar exactamente ${serialLoadVariant.missingUnits} seriales para esta variante.`,
      });
      return;
    }

    const duplicatesInInput = new Set();
    const seen = new Set();
    for (const identifier of identifiers) {
      const key = normalizeIdentifierKey(identifier);
      if (!key) {
        toast.warning("Serial invalido", {
          description: "Todos los IMEI/SN deben tener contenido valido.",
        });
        return;
      }
      if (seen.has(key)) duplicatesInInput.add(identifier);
      seen.add(key);
    }

    if (duplicatesInInput.size > 0) {
      toast.warning("Seriales duplicados", {
        description: "No puedes repetir IMEI/SN en la misma carga.",
      });
      return;
    }

    setSerialLoadSubmitting(true);

    const normalizedIdentifiers = identifiers.map((identifier) =>
      normalizeIdentifierKey(identifier),
    );
    const { data: existingUnits, error: existingError } = await supabase
      .from("inventory_units")
      .select("id, identifier_value")
      .in("identifier_normalized", normalizedIdentifiers);

    if (existingError) {
      console.error(existingError);
      toast.error("Error", {
        description: "No se pudo validar si los seriales ya existen.",
      });
      setSerialLoadSubmitting(false);
      return;
    }

    if ((existingUnits || []).length > 0) {
      toast.warning("Serial ya existente", {
        description: `Al menos uno de los seriales ya existe en inventario: ${existingUnits
          .map((unit) => unit.identifier_value)
          .join(", ")}.`,
      });
      setSerialLoadSubmitting(false);
      return;
    }

    for (const identifier of identifiers) {
      const { data: insertedUnit, error: insertError } = await supabase
        .from("inventory_units")
        .insert({
          variant_id: serialLoadVariant.id,
          identifier_value: identifier,
          status: "available",
          received_at: new Date().toISOString(),
          notes: "Carga manual de seriales desde inventario",
          updated_by: user?.id || null,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(insertError);
        toast.error("Error", {
          description: `No se pudo crear la unidad ${identifier}.`,
        });
        setSerialLoadSubmitting(false);
        return;
      }

      const { error: eventError } = await supabase
        .from("inventory_unit_events")
        .insert({
          inventory_unit_id: insertedUnit.id,
          event_type: "manual_serial_stock_initialized",
          from_status: null,
          to_status: "available",
          related_table: "inventory_units",
          related_id: insertedUnit.id,
          notes: "Carga manual para conciliar stock serializado existente",
          payload: {
            source: "inventory_manual_load",
            variant_id: serialLoadVariant.id,
          },
        });

      if (eventError) {
        console.error(eventError);
        toast.error("Error", {
          description: `La unidad ${identifier} se creo, pero fallo el evento asociado.`,
        });
        setSerialLoadSubmitting(false);
        return;
      }
    }

    toast.success("Seriales cargados", {
      description: `Se cargaron ${identifiers.length} unidades para ${formatVariantLabel(serialLoadVariant)}.`,
    });

    setSerialLoadSubmitting(false);
    setSerialLoadDialogOpen(false);
    setSerialLoadVariant(null);
    setSerialIdentifiersText("");
    fetchInventoryData();
  }, [fetchInventoryData, serialIdentifiersText, serialLoadVariant, user?.id]);

  const openEditUnitDialog = useCallback((unit) => {
    setEditingUnit(unit);
    setEditIdentifierValue(unit.identifier_value || "");
    setEditUnitDialogOpen(true);
  }, []);

  const handleSaveIdentifier = useCallback(async () => {
    if (!editingUnit || !editIdentifierValue.trim()) return;

    const newIdentifier = editIdentifierValue.trim();
    const newNormalized = normalizeIdentifierKey(newIdentifier);

    if (!newNormalized) {
      toast.warning("IMEI inválido", {
        description: "El IMEI/SN debe tener contenido válido.",
      });
      return;
    }

    setEditSubmitting(true);

    const { data: existingUnits, error: searchError } = await supabase
      .from("inventory_units")
      .select("id, identifier_value, variant_id, status")
      .eq("identifier_normalized", newNormalized)
      .neq("id", editingUnit.id);

    if (searchError) {
      console.error(searchError);
      toast.error("Error", {
        description: "No se pudo verificar si el IMEI ya existe.",
      });
      setEditSubmitting(false);
      return;
    }

    if ((existingUnits || []).length > 0) {
      const unitsWithVariantInfo = await Promise.all(
        (existingUnits || []).map(async (unit) => {
          const { data: variant } = await supabase
            .from("product_variants")
            .select("variant_name, products(name)")
            .eq("id", unit.variant_id)
            .single();
          return { ...unit, variant };
        }),
      );

      setDuplicateUnits(unitsWithVariantInfo);
      setPendingIdentifier(newIdentifier);
      setAssignToCurrent(true);
      setDuplicateDialogOpen(true);
      setEditSubmitting(false);
      return;
    }

    for (const unit of duplicateUnits) {
      const { error: deleteError } = await supabase
        .from("inventory_units")
        .delete()
        .eq("id", unit.id);

      if (deleteError) {
        console.error(deleteError);
        toast.error("Error", {
          description: `No se pudo eliminar la unidad #${unit.id}.`,
        });
        setEditSubmitting(false);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("inventory_units")
      .update({
        identifier_value: newIdentifier,
        updated_by: user?.id || null,
      })
      .eq("id", editingUnit.id);

    if (updateError) {
      console.error(updateError);
      toast.error("Error", {
        description: "No se pudo actualizar el IMEI.",
      });
      setEditSubmitting(false);
      return;
    }

    const { error: eventError } = await supabase
      .from("inventory_unit_events")
      .insert({
        inventory_unit_id: editingUnit.id,
        event_type: "manual_serial_stock_initialized",
        from_status: editingUnit.status,
        to_status: editingUnit.status,
        related_table: "inventory_units",
        related_id: editingUnit.id,
        notes: `IMEI actualizado de "${editingUnit.identifier_value || "(vacío)"}" a "${newIdentifier}"`,
      });

    if (eventError) {
      console.error(eventError);
    }

    toast.success("IMEI actualizado", {
      description: `La unidad ahora tiene el IMEI: ${newIdentifier}`,
    });

    setEditSubmitting(false);
    setEditUnitDialogOpen(false);
    setEditingUnit(null);
    setEditIdentifierValue("");
    fetchInventoryData();
  }, [editingUnit, editIdentifierValue, user?.id, fetchInventoryData]);

  const handleAssignDuplicateToExisting = useCallback(async () => {
    if (!pendingIdentifier) return;

    if (assignToCurrent && editingUnit) {
      setEditSubmitting(true);

      for (const duplicateUnit of duplicateUnits) {
        const { error: deleteError } = await supabase
          .from("inventory_units")
          .delete()
          .eq("id", duplicateUnit.id);

        if (deleteError) {
          console.error(deleteError);
          toast.error("Error", {
            description: `No se pudo eliminar la unidad #${duplicateUnit.id}.`,
          });
          setEditSubmitting(false);
          return;
        }
      }

      const { error: updateCurrentError } = await supabase
        .from("inventory_units")
        .update({
          identifier_value: pendingIdentifier,
          updated_by: user?.id || null,
        })
        .eq("id", editingUnit.id);

      if (updateCurrentError) {
        console.error(updateCurrentError);
        toast.error("Error", {
          description: "No se pudo actualizar el IMEI de la unidad actual.",
        });
        setEditSubmitting(false);
        return;
      }

      const { error: eventCurrentError } = await supabase
        .from("inventory_unit_events")
        .insert({
          inventory_unit_id: editingUnit.id,
          event_type: "manual_serial_stock_initialized",
          from_status: editingUnit.status,
          to_status: editingUnit.status,
          related_table: "inventory_units",
          related_id: editingUnit.id,
          notes: `IMEI asignado: ${pendingIdentifier} (tomado de otra unidad por duplicado)`,
        });

      if (eventCurrentError) {
        console.error(eventCurrentError);
      }

      toast.success("IMEI asignado a unidad actual", {
        description: `La unidad actual #{${editingUnit.id}} ahora tiene el IMEI ${pendingIdentifier}. Las unidades duplicadas fueron eliminadas.`,
      });

      setEditSubmitting(false);
    } else {
      if (editingUnit) {
        const { error: deleteError } = await supabase
          .from("inventory_units")
          .delete()
          .eq("id", editingUnit.id);

        if (deleteError) {
          console.error(deleteError);
          toast.error("Error", {
            description: `No se pudo eliminar la unidad actual.`,
          });
          return;
        }
      }

      toast.success("IMEI mantenido", {
        description: `La unidad actual fue eliminada. El IMEI ${pendingIdentifier} permanece en la unidad existente.`,
      });
    }

    setDuplicateDialogOpen(false);
    setDuplicateUnits([]);
    setPendingIdentifier("");
    setAssignToCurrent(false);
    setEditUnitDialogOpen(false);
    setEditingUnit(null);
    setEditIdentifierValue("");
    fetchInventoryData();
  }, [
    assignToCurrent,
    pendingIdentifier,
    editingUnit,
    duplicateUnits,
    user?.id,
    fetchInventoryData,
  ]);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Resumen por variante y trazabilidad por unidad serializada.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={fetchInventoryData}
          disabled={refreshing}
        >
          <IconRefresh className="mr-2 h-4 w-4" />
          {refreshing ? "Actualizando..." : "Refrescar"}
        </Button>
      </div>

      {serialVariantsWithoutUnits.length > 0 ? (
        <Card className="mt-6 border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <IconAlertTriangle className="h-5 w-5" />
              Stock serializado sin unidades cargadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Estas variantes ya estan marcadas como serializadas, pero el stock
              disponible no tiene todas sus unidades creadas en
              `inventory_units`. Mientras exista esta diferencia, no vas a poder
              vender ese stock desde el flujo serializado.
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[320px] min-w-[320px]">
                      Producto / Variante
                    </TableHead>
                    <TableHead className="text-right">Stock actual</TableHead>
                    <TableHead className="text-right">
                      Unidades disponibles
                    </TableHead>
                    <TableHead className="text-right">
                      Faltan seriales
                    </TableHead>
                    <TableHead className="text-right">
                      Sobran seriales
                    </TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serialVariantsWithoutUnits.map((variant) => (
                    <TableRow key={`serial-gap-${variant.id}`}>
                      <TableCell className="w-[320px] min-w-[320px] max-w-[320px]">
                        <div className="space-y-1 max-w-[320px]">
                          <div
                            className="truncate font-medium"
                            title={formatVariantLabel(variant)}
                          >
                            {formatVariantLabel(variant)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[
                              variant.products?.brands?.name,
                              variant.products?.categories?.name,
                            ]
                              .filter(Boolean)
                              .join(" - ") || "Sin clasificacion"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(variant.stock || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {variant.unitCounts.available}
                      </TableCell>
                      <TableCell className="text-right">
                        {variant.missingUnits}
                      </TableCell>
                      <TableCell className="text-right">
                        {variant.excessUnits}
                      </TableCell>
                      <TableCell className="text-right">
                        {variant.missingUnits > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => openSerialLoadDialog(variant)}
                          >
                            Cargar seriales
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Revisar inconsistencia
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Variantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.variantCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stock disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.availableStock}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stock defectuoso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.defectiveStock}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unidades serializadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.serialUnits}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={activeTab === "units" ? "Buscar por IMEI únicamente" : "Buscar por producto, variante"}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <Select
              value={filters.unitStatus}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, unitStatus: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado de unidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(STATUS_LABELS).map(([status, label]) => (
                  <SelectItem key={status} value={status}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6 space-y-4">
        <TabsList>
          <TabsTrigger value="summary">
            <IconBox className="mr-2 h-4 w-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="units">
            <IconStack2 className="mr-2 h-4 w-4" />
            Unidades
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Resumen por variante</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-10 text-sm text-muted-foreground">
                  Cargando inventario...
                </div>
              ) : paginatedSummaryRows.length === 0 ? (
                <div className="py-10 text-sm text-muted-foreground">
                  No hay variantes que coincidan con los filtros actuales.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[320px] min-w-[320px]">
                          Producto / Variante
                        </TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Defectuoso</TableHead>
                        <TableHead className="text-right">
                          Serial disponibles
                        </TableHead>
                        <TableHead className="text-right">
                          Serial vendidas
                        </TableHead>
                        <TableHead className="text-right">
                          Serial otras
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSummaryRows.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell className="w-[320px] min-w-[320px] max-w-[320px]">
                            <div className="space-y-1 max-w-[320px]">
                              <div
                                className="truncate font-medium"
                                title={formatVariantLabel(variant)}
                              >
                                {formatVariantLabel(variant)}
                              </div>
                              <div
                                className="truncate text-xs text-muted-foreground"
                                title={
                                  [
                                    variant.products?.brands?.name,
                                    variant.products?.categories?.name,
                                  ]
                                    .filter(Boolean)
                                    .join(" - ") || "Sin clasificacion"
                                }
                              >
                                {[
                                  variant.products?.brands?.name,
                                  variant.products?.categories?.name,
                                ]
                                  .filter(Boolean)
                                  .join(" - ") || "Sin clasificacion"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {
                                TRACKING_LABELS[
                                  variant.products?.inventory_tracking_mode ||
                                    "quantity"
                                ]
                              }
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(variant.stock || 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(variant.stock_defective || 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {variant.unitCounts.available}
                          </TableCell>
                          <TableCell className="text-right">
                            {variant.unitCounts.sold}
                          </TableCell>
                          <TableCell className="text-right">
                            {variant.unitCounts.defective +
                              variant.unitCounts.inRepair +
                              variant.unitCounts.other}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex flex-col items-center justify-between gap-3 py-3 sm:flex-row">
                    <div className="text-sm text-muted-foreground">
                      {summaryTotalCount > 0
                        ? `Mostrando ${paginatedSummaryRows.length} de ${summaryTotalCount} variantes`
                        : `${summaryTotalCount} variantes en total`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSummaryPage((p) => Math.max(1, p - 1))}
                        disabled={summaryPage <= 1 || loading}
                      >
                        Anterior
                      </Button>
                      <div className="text-sm">
                        {summaryPage} /{" "}
                        {Math.max(
                          1,
                          Math.ceil(summaryTotalCount / summaryPageSize),
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSummaryPage((p) =>
                            Math.min(
                              Math.ceil(summaryTotalCount / summaryPageSize),
                              p + 1,
                            ),
                          )
                        }
                        disabled={
                          summaryPage >=
                            Math.ceil(summaryTotalCount / summaryPageSize) ||
                          loading
                        }
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units">
          <Card>
            <CardHeader>
              <CardTitle>Listado de unidades serializadas</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-10 text-sm text-muted-foreground">
                  Cargando unidades...
                </div>
              ) : filteredUnits.length === 0 ? (
                <div className="py-10 text-sm text-muted-foreground">
                  No hay unidades que coincidan con los filtros actuales.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IMEI / SN</TableHead>
                        <TableHead className="w-[320px] min-w-[320px]">
                          Producto / Variante
                        </TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Compra</TableHead>
                        <TableHead>Venta</TableHead>
                        <TableHead>Fechas</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUnits.map((unit) => (
                        <TableRow key={unit.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {unit.identifier_value}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Unidad #{unit.id}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="w-[320px] min-w-[320px] max-w-[320px]">
                            <div className="space-y-1 max-w-[320px]">
                              <div
                                className="truncate font-medium"
                                title={formatVariantLabel(unit.variant)}
                              >
                                {formatVariantLabel(unit.variant)}
                              </div>
                              <div
                                className="truncate text-xs text-muted-foreground"
                                title={
                                  [
                                    unit.variant?.products?.brands?.name,
                                    unit.variant?.products?.categories?.name,
                                  ]
                                    .filter(Boolean)
                                    .join(" - ") || "Sin clasificacion"
                                }
                              >
                                {[
                                  unit.variant?.products?.brands?.name,
                                  unit.variant?.products?.categories?.name,
                                ]
                                  .filter(Boolean)
                                  .join(" - ") || "Sin clasificacion"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={STATUS_BADGE_CLASS[unit.status] || ""}
                              variant="outline"
                            >
                              {getStatusLabel(unit.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {unit.purchase?.id ? (
                              <div className="space-y-1 text-sm">
                                <div>Compra #{unit.purchase.id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {unit.purchase.providers?.name ||
                                    "Sin proveedor"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {unit.sale?.id ? (
                              <div className="space-y-1 text-sm">
                                <div>Venta #{unit.sale.id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatCustomerName(unit.sale.customers)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>
                                Recibida: {formatDateTime(unit.received_at)}
                              </div>
                              <div>Vendida: {formatDateTime(unit.sold_at)}</div>
                              <div>
                                Devuelta: {formatDateTime(unit.returned_at)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <IconDotsVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => openEditUnitDialog(unit)}
                                >
                                  <IconPencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openHistory(unit)}
                                >
                                  <IconHistory className="mr-2 h-4 w-4" />
                                  Historial
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex flex-col items-center justify-between gap-3 py-3 sm:flex-row">
                    <div className="text-sm text-muted-foreground">
                      {filteredUnits.length > 0 && unitsTotalCount > 0
                        ? `Mostrando ${units.length} de ${unitsTotalCount} unidades`
                        : `${unitsTotalCount} unidades en total`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUnitsPage((p) => Math.max(1, p - 1))}
                        disabled={unitsPage <= 1 || loading}
                      >
                        Anterior
                      </Button>
                      <div className="text-sm">
                        {unitsPage} /{" "}
                        {Math.max(
                          1,
                          Math.ceil(unitsTotalCount / unitsPageSize),
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setUnitsPage((p) =>
                            Math.min(
                              Math.ceil(unitsTotalCount / unitsPageSize),
                              p + 1,
                            ),
                          )
                        }
                        disabled={
                          unitsPage >=
                            Math.ceil(unitsTotalCount / unitsPageSize) ||
                          loading
                        }
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Historial de unidad {selectedUnit?.identifier_value || ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedUnit ? (
              <Card>
                <CardContent className="grid gap-2 pt-6 text-sm md:grid-cols-2">
                  <div>
                    <span className="font-medium">Variante:</span>{" "}
                    {formatVariantLabel(selectedUnit.variant)}
                  </div>
                  <div>
                    <span className="font-medium">Estado actual:</span>{" "}
                    {getStatusLabel(selectedUnit.status)}
                  </div>
                  <div>
                    <span className="font-medium">Compra:</span>{" "}
                    {selectedUnit.purchase?.id
                      ? `#${selectedUnit.purchase.id}`
                      : "-"}
                  </div>
                  <div>
                    <span className="font-medium">Venta:</span>{" "}
                    {selectedUnit.sale?.id ? `#${selectedUnit.sale.id}` : "-"}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {historyLoading ? (
              <div className="py-8 text-sm text-muted-foreground">
                Cargando historial...
              </div>
            ) : unitEvents.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">
                No hay eventos registrados para esta unidad.
              </div>
            ) : (
              <ScrollArea className="max-h-[420px] pr-3">
                <div className="space-y-3">
                  {unitEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {getEventLabel(event.event_type)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(event.created_at)}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">
                          {getStatusLabel(event.from_status)}
                        </Badge>
                        <span>{">"}</span>
                        <Badge variant="outline">
                          {getStatusLabel(event.to_status)}
                        </Badge>
                        {event.related_table && event.related_id ? (
                          <span>
                            {event.related_table} #{event.related_id}
                          </span>
                        ) : null}
                      </div>

                      {event.notes ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {event.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={serialLoadDialogOpen}
        onOpenChange={setSerialLoadDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cargar seriales faltantes</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <div>
                <span className="font-medium">Variante:</span>{" "}
                {serialLoadVariant
                  ? formatVariantLabel(serialLoadVariant)
                  : "-"}
              </div>
              <div className="mt-1">
                <span className="font-medium">Stock sin serializar:</span>{" "}
                {serialLoadVariant?.missingUnits || 0} unidad(es)
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ingresá un IMEI/SN por linea. Debes cargar exactamente{" "}
                {serialLoadVariant?.missingUnits || 0} seriales para conciliar
                el stock actual sin modificar la cantidad existente.
              </p>
              <Textarea
                rows={10}
                placeholder={"359881234567890\n359881234567891\nSN-ABC-123456"}
                value={serialIdentifiersText}
                onChange={(event) =>
                  setSerialIdentifiersText(event.target.value)
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSerialLoadDialogOpen(false);
                setSerialLoadVariant(null);
                setSerialIdentifiersText("");
              }}
              disabled={serialLoadSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleLoadSerialUnits}
              disabled={serialLoadSubmitting}
            >
              {serialLoadSubmitting ? "Guardando..." : "Guardar seriales"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editUnitDialogOpen} onOpenChange={setEditUnitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar IMEI de unidad</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {editingUnit && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div>
                  <span className="font-medium">Unidad ID:</span> #
                  {editingUnit.id}
                </div>
                <div className="mt-1">
                  <span className="font-medium">Variante:</span>{" "}
                  {formatVariantLabel(editingUnit.variant)}
                </div>
                <div className="mt-1">
                  <span className="font-medium">IMEI actual:</span>{" "}
                  {editingUnit.identifier_value || "(sin IMEI)"}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Nuevo IMEI / SN</label>
              <Input
                value={editIdentifierValue}
                onChange={(e) => setEditIdentifierValue(e.target.value)}
                placeholder="Ingrese el nuevo IMEI o número de serie"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editIdentifierValue.trim()) {
                    handleSaveIdentifier();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Ingrese el nuevo IMEI o número de serie. Se verificará que no
                esté en uso por otra unidad.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditUnitDialogOpen(false);
                setEditingUnit(null);
                setEditIdentifierValue("");
              }}
              disabled={editSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveIdentifier}
              disabled={editSubmitting || !editIdentifierValue.trim()}
            >
              {editSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>IMEI ya existe</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                El IMEI "{pendingIdentifier}" ya está asignado a otra(s)
                unidad(es).
              </p>
              <p className="mt-2 text-muted-foreground">
                ¿Qué deseas hacer? Podés asignar el IMEI a la unidad actual que
                estás editando (las otras quedarán sin IMEI), o mantener el IMEI
                donde está (la unidad actual quedará sin IMEI).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Unidades con este IMEI
              </label>
              <div className="grid gap-2">
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/50 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
                  <div>
                    <div className="font-medium">
                      Unidad #{editingUnit?.id} (actual)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {editingUnit?.variant?.products?.name} -{" "}
                      {editingUnit?.variant?.variant_name}
                    </div>
                  </div>
                  <Badge className="border-emerald-500 bg-emerald-100 text-emerald-700">
                    A editar
                  </Badge>
                </div>
                {duplicateUnits.map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="font-medium">Unidad #{unit.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {unit.variant?.products?.name} -{" "}
                        {unit.variant?.variant_name}
                      </div>
                    </div>
                    <Badge
                      className={STATUS_BADGE_CLASS[unit.status] || ""}
                      variant="outline"
                    >
                      {getStatusLabel(unit.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDuplicateDialogOpen(false);
                setDuplicateUnits([]);
                setPendingIdentifier("");
                setAssignToCurrent(false);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleAssignDuplicateToExisting}>
              {assignToCurrent
                ? "Asignar a unidad actual"
                : "Mantener IMEI donde está"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
