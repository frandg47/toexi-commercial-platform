import { create } from "zustand";

export const useSaleStore = create((set) => ({
  customer: null,
  items: [],
  fxRate: null,
  notes: "",
  payments: [],

  setCustomer: (customer) => set({ customer }),
  setItems: (items) => set({ items }),
  setFxRate: (fxRate) => set({ fxRate }),
  setNotes: (notes) => set({ notes }),
  setPayments: (payments) => set({ payments }),

  resetSale: () =>
    set({
      customer: null,
      items: [],
      fxRate: null,
      notes: "",
      payments: [],
    }),
}));
