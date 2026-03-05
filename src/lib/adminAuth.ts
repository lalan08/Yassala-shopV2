"use client";

export const ADMIN_PASSWORD = "yassala2025";
export const AUTH_KEY = "yassala_admin_auth";

export async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getStoredAuth(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_KEY);
}

export function setStoredAuth(hash: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_KEY, hash);
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
}
