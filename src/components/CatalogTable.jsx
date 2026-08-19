"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, } from "@/components/ui/alert-dialog";
import {
  IconBallpen,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import DialogCatalog from "../components/DialogCatalog";
import ConcentricLoader from "../components/ui/loading";

export default function CatalogTable({ tipo }) {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameFilter, setNameFilter] = useState("");
  const [productCounts, setProductCounts] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    item: null,
    type: "",
  });



  // Modales
  const [modal, setModal] = useState({
    open: false,
    editId: null,
    initial: "",
    type: "",
  });


  const deleteItem = (item, type) => {
    setDeleteDialog({
      open: true,
      item,
      type,
    });
  };

  useEffect(() => {
    fetchData();
  }, [tipo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let catData = [];
      let brData = [];

      if (tipo === "brands") {
        const { data, error } = await supabase.from("brands").select("*");
        if (error) throw error;
        brData = data || [];
        setBrands(brData);
      } else if (tipo === "categories") {
        const { data, error } = await supabase.from("categories").select("*");
        if (error) throw error;
        catData = data || [];
        setCategories(catData);
      } else {
        const [{ data: cat }, { data: br }] = await Promise.all([
          supabase.from("categories").select("*"),
          supabase.from("brands").select("*"),
        ]);
        catData = cat || [];
        brData = br || [];
        setCategories(catData);
        setBrands(brData);
      }

      // 🔹 Contar productos por marca y categoría
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, brand_id, category_id");

      if (prodError) throw prodError;

      // Agrupar manualmente
      const counts = {};
      products.forEach((p) => {
        if (p.brand_id)
          counts[`brand-${p.brand_id}`] =
            (counts[`brand-${p.brand_id}`] || 0) + 1;
        if (p.category_id)
          counts[`category-${p.category_id}`] =
            (counts[`category-${p.category_id}`] || 0) + 1;
      });

      setProductCounts(counts);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };


  const handleConfirmDelete = async () => {
    const { item, type } = deleteDialog;
    if (!item) return;

    const table = type === "brand" ? "brands" : "categories";

    try {
      const { error } = await supabase.from(table).delete().eq("id", item.id);
      if (error) throw error;

      if (type === "brand") {
        setBrands((prev) => prev.filter((b) => b.id !== item.id));
      } else {
        setCategories((prev) => prev.filter((c) => c.id !== item.id));
      }

      toast.success(
        `${type === "brand" ? "Marca" : "Categoría"} eliminada correctamente`
      );
    } catch (err) {
      toast.error("Error al eliminar", { description: err.message });
    } finally {
      setDeleteDialog({ open: false, item: null, type: "" });
    }
  };


  /* ---------- CRUD ---------- */
  const saveItem = async (name, id = null, type) => {
    if (!name) return toast.error("El nombre no puede estar vacío");
    const table = type === "brand" ? "brands" : "categories";

    if (id) {
      const { data, error } = await supabase
        .from(table)
        .update({ name })
        .eq("id", id)
        .select();
      if (error) return toast.error(`Error al editar ${type === "brand" ? "marca" : "categoría"}`);
      if (type === "brand")
        setBrands((prev) => prev.map((b) => (b.id === id ? data[0] : b)));
      else
        setCategories((prev) => prev.map((c) => (c.id === id ? data[0] : c)));
      toast.success(`${capitalize(type === "brand" ? "marca" : "categoría")} actualizada`);
    } else {
      const { data, error } = await supabase
        .from(table)
        .insert([{ name }])
        .select();
      if (error) return toast.error(`Error al agregar ${type === "brand" ? "marca" : "categoría"}`);
      if (type === "brand") setBrands((prev) => [...prev, data[0]]);
      else setCategories((prev) => [...prev, data[0]]);
      toast.success(`${capitalize(type === "brand" ? "marca" : "categoría")} agregada`);
    }
  };

  // const deleteItem = async (id, type) => {
  //   const table = type === "brand" ? "brands" : "categories";
  //   const { error } = await supabase.from(table).delete().eq("id", id);
  //   if (error) return toast.error(`Error al eliminar ${type === "brand" ? "marca" : "categoría"}`);
  //   if (type === "brand") setBrands((prev) => prev.filter((b) => b.id !== id));
  //   else setCategories((prev) => prev.filter((c) => c.id !== id));
  //   toast.success(`${capitalize(type === "brand" ? "marca" : "categoría")} eliminada`);
  // };

  const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  const filterByName = (items) =>
    items.filter((i) =>
      i.name.toLowerCase().includes(nameFilter.toLowerCase())
    );

  if (loading)
    return (
      <div className="flex items-center justify-center h-100">
        <ConcentricLoader />
      </div>
    );

  const renderCards = (items, type) => {
    return (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filterByName(items).map((item) => (
          <Card
            key={item.id}
            className="relative border shadow-sm hover:shadow-md transition-all"
          >
            <CardHeader>
              <CardTitle className={`flex items-center justify-between`}>
                <span className={`font-semibold`}>{item.name}</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setModal({
                        open: true,
                        editId: item.id,
                        initial: item.name,
                        type,
                      })
                    }
                  >
                    <IconEdit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteItem(item, type)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="px-3 py-1"
              >
                {productCounts[`${type}-${item.id}`] || 0} productos
              </Badge>
            </CardContent>
          </Card>
        ))}

        {filterByName(items).length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-6">
            <Badge variant="secondary">No hay resultados</Badge>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="
  flex flex-col gap-3
  lg:flex-row lg:items-center lg:justify-between
  my-4
">

        {/* Buscador */}
        <Input
          placeholder="Buscar por nombre..."
          onChange={(e) => setNameFilter(e.target.value)}
          className="w-full lg:w-72"
        />

        {/* Botones */}
        <div className="
    flex gap-2 justify-end
    w-full lg:w-auto
    flex-wrap
  ">
          <Button
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <IconRefresh
              className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Refrescar
          </Button>

          <Button
            onClick={() =>
              setModal({
                open: true,
                editId: null,
                initial: "",
                type: tipo === "brands" ? "brand" : "category",
              })
            }
            className="flex items-center gap-2"
          >
            <IconPlus className="h-4 w-4" />
            Agregar
          </Button>
        </div>
      </div>

      <div className="container my-6 space-y-10 ">
        {(tipo === "all" || tipo === "categories") && (
          <>{renderCards(categories, "category")}</>
        )}

        {(tipo === "all" || tipo === "brands") && (
          <>{renderCards(brands, "brand")}</>
        )}

        {/* 🪟 Modal de creación/edición */}
        <DialogCatalog
          open={modal.open}
          onClose={() =>
            setModal({ open: false, editId: null, initial: "", type: "" })
          }
          onConfirm={(val) => {
            saveItem(val, modal.editId, modal.type);
            setModal({ open: false, editId: null, initial: "", type: "" });
          }}
          label={
            modal.editId
              ? `Editar ${capitalize(modal.type === "brand" ? "Marca" : "Categoría")}`
              : `Agregar ${capitalize(modal.type === "brand" ? "Marca" : "Categoría")}`
          }
          initialValue={modal.initial}
        />

        <AlertDialog
          open={deleteDialog.open}
          onOpenChange={(open) =>
            !open && setDeleteDialog({ open: false, item: null, type: "" })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar</AlertDialogTitle>
              <AlertDialogDescription>
                Estás por eliminar{" "}
                <strong>{deleteDialog.item?.name}</strong>. Esta acción no
                puede deshacerse.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-red-500 hover:bg-red-600"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </>
  );
}
