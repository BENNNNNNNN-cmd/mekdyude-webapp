"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import Image from "next/image";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat px-4"
      style={{ backgroundImage: "url('/images/Background_MekDyude_login.png')" }}
    >
      <div className="absolute inset-0 bg-black/45" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <Image
              src="/images/logo.svg"
              alt="Mek Dyude"
              width={246}
              height={209}
              loading="eager"
              className="mb-3 h-16 w-auto drop-shadow-lg"
            />
            <h1 className="font-serif text-2xl font-bold text-white tracking-wide">
              Mek Dyude
            </h1>
            <p className="mt-1 text-xs text-white/70">Duché de Bicolline</p>
          </div>

          {/* Error message */}
          {state?.error && (
            <div className="mb-4 rounded-lg border border-red-200/60 bg-red-950/40 p-3 text-center text-sm text-red-100 backdrop-blur-sm">
              {state.error}
            </div>
          )}

          {/* Login form */}
          <form action={action} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-white/85"
              >
                Nom d&apos;utilisateur
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                autoFocus
                autoComplete="username"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-brand-amber/50 focus:border-brand-amber"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-white/85"
              >
                Mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-brand-amber/50 focus:border-brand-amber"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg border border-amber-300/40 bg-sidebar/80 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sidebar/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-white/65">
          Bicolline Manager v0.1
        </p>
      </div>
    </div>
  );
}
