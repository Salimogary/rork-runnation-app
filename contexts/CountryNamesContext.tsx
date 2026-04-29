import React, { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { setCountryNameOverrides } from "@/constants/country-utils";

export function CountryNamesProvider({ children }: { children: React.ReactNode }) {
  const { data } = trpc.auth.getCountries.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    setCountryNameOverrides(data ?? null);
  }, [data]);

  return <>{children}</>;
}
