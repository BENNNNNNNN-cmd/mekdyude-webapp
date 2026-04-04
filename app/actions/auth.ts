"use server";

import { getDb, verifyPassword } from "@/db";
import { createSession, deleteSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function login(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Nom d'utilisateur et mot de passe requis." };
  }

  const db = getDb();
  const user = db
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username) as { id: number; username: string; password_hash: string; role: string } | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Identifiants invalides." };
  }

  await createSession({ id: user.id, username: user.username, role: user.role });
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
