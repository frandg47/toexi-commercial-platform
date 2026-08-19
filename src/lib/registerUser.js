import { supabase } from "./supabaseClient";

export const registerUser = async ({
  name,
  lastName,
  dni,
  phone,
  address,
  email,
  password,
  role = "seller",
  state = false, // o is_active si ya renombraste el campo
}) => {
  // 1️⃣ Crear usuario en auth.users
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    console.error("Error en registro:", signUpError);
    throw new Error("No se pudo registrar el usuario: " + signUpError.message);
  }

  const authUser = signUpData?.user;
  if (!authUser?.id) {
    throw new Error("No fue posible obtener el identificador del usuario");
  }

  // 2️⃣ Insertar datos complementarios en tabla users
  const { error: insertError } = await supabase.from("users").insert([
    {
      id_auth: authUser.id, // FK a auth.users
      name,
      last_name: lastName,
      dni,
      phone,
      adress: address,
      email,
      role,
      state, // si ya renombraste la columna, poné is_active en lugar de state
    },
  ]);

  if (insertError) {
    console.error("Error insertando en users:", insertError);

    // 🧹 rollback: si falla el insert, borrar el usuario de auth
    await supabase.auth.admin.deleteUser(authUser.id);

    throw new Error(
      "Error al guardar los datos del usuario: " + insertError.message
    );
  }

  // 3️⃣ Éxito
  return {
    success: true,
    message: "Usuario registrado correctamente. Pendiente de activación.",
  };
};
