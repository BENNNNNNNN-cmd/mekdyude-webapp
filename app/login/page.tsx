"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import Image from "next/image";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center bg-parchment">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-lg p-8 border border-brand-amber/20">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <Image
              src="/images/logo.svg"
              alt="Mek Dyude"
              width={64}
              height={64}
              className="mb-3 drop-shadow-lg"
            />
            <h1 className="font-serif text-2xl font-bold text-sidebar tracking-wide">
              Mek Dyude
            </h1>
            <p className="text-xs text-gray-400 mt-1">Duché de Bicolline</p>
          </div>

          {/* Error message */}
          {state?.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
              {state.error}
            </div>
          )}

          {/* Login form */}
          <form action={action} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-1"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-amber/50 focus:border-brand-amber"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-amber/50 focus:border-brand-amber"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full py-2.5 bg-sidebar text-white rounded-lg text-sm font-medium hover:bg-sidebar/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Bicolline Manager v0.1
        </p>
      </div>
    </div>
  );
}
