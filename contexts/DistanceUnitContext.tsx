import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type DistanceUnit = "kilometers" | "miles";

const STORAGE_KEY = "runnation_distance_unit";
const KM_TO_MILES = 0.621371;

type DistanceUnitContextValue = {
  distanceUnit: DistanceUnit;
  distanceUnitLabel: string;
  distanceUnitShortLabel: string;
  setDistanceUnit: (unit: DistanceUnit) => void;
  toggleDistanceUnit: () => void;
  convertDistanceFromKm: (distanceKm: number | null | undefined) => number;
  formatDistance: (distanceKm: number | null | undefined, digits?: number) => string;
};

const DistanceUnitContext = createContext<DistanceUnitContextValue | undefined>(undefined);

function normalizeDistanceUnit(value: string | null): DistanceUnit {
  return value === "miles" ? "miles" : "kilometers";
}

export function DistanceUnitProvider({ children }: { children: React.ReactNode }) {
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>("kilometers");

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (mounted) setDistanceUnitState(normalizeDistanceUnit(stored));
      })
      .catch(() => {
        if (mounted) setDistanceUnitState("kilometers");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setDistanceUnit = useCallback((unit: DistanceUnit) => {
    setDistanceUnitState(unit);
    AsyncStorage.setItem(STORAGE_KEY, unit).catch((error) => {
      console.warn("[DistanceUnit] Could not save preference:", error);
    });
  }, []);

  const toggleDistanceUnit = useCallback(() => {
    setDistanceUnit(distanceUnit === "kilometers" ? "miles" : "kilometers");
  }, [distanceUnit, setDistanceUnit]);

  const convertDistanceFromKm = useCallback(
    (distanceKm: number | null | undefined) => {
      const value = Number(distanceKm || 0);
      return distanceUnit === "miles" ? value * KM_TO_MILES : value;
    },
    [distanceUnit]
  );

  const formatDistance = useCallback(
    (distanceKm: number | null | undefined, digits = 1) => {
      if (distanceKm === null || distanceKm === undefined || Number.isNaN(Number(distanceKm))) {
        return `-- ${distanceUnit === "miles" ? "mi" : "km"}`;
      }
      return `${convertDistanceFromKm(distanceKm).toFixed(digits)} ${distanceUnit === "miles" ? "mi" : "km"}`;
    },
    [convertDistanceFromKm, distanceUnit]
  );

  const value = useMemo<DistanceUnitContextValue>(
    () => ({
      distanceUnit,
      distanceUnitLabel: distanceUnit === "miles" ? "Miles" : "Kilometers",
      distanceUnitShortLabel: distanceUnit === "miles" ? "mi" : "km",
      setDistanceUnit,
      toggleDistanceUnit,
      convertDistanceFromKm,
      formatDistance,
    }),
    [convertDistanceFromKm, distanceUnit, formatDistance, setDistanceUnit, toggleDistanceUnit]
  );

  return <DistanceUnitContext.Provider value={value}>{children}</DistanceUnitContext.Provider>;
}

export function useDistanceUnit(): DistanceUnitContextValue {
  const context = useContext(DistanceUnitContext);
  if (context) return context;

  return {
    distanceUnit: "kilometers",
    distanceUnitLabel: "Kilometers",
    distanceUnitShortLabel: "km",
    setDistanceUnit: () => {},
    toggleDistanceUnit: () => {},
    convertDistanceFromKm: (distanceKm) => Number(distanceKm || 0),
    formatDistance: (distanceKm, digits = 1) =>
      distanceKm === null || distanceKm === undefined ? "-- km" : `${Number(distanceKm || 0).toFixed(digits)} km`,
  };
}
