import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,       // ✅ Guarda la sesión localmente
    autoRefreshToken: true,     // ✅ Renueva el token automáticamente
    detectSessionInUrl: true,   // ✅ Lee el token desde la URL /auth/callback
  },
});
