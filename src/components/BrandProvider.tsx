"use client";
import { createContext, useContext } from "react";

export type ClientBrand = { name: string; tagline: string; logoUrl: string | null };

const Ctx = createContext<ClientBrand>({ name: "Situation Room", tagline: "Real-time election monitoring", logoUrl: null });

export function BrandProvider({ brand, children }: { brand: ClientBrand; children: React.ReactNode }) {
  return <Ctx.Provider value={brand}>{children}</Ctx.Provider>;
}

export function useBrand() {
  return useContext(Ctx);
}
