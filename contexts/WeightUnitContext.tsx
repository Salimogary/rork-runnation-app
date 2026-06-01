import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type WeightUnit = "kg" | "lbs";

const STORAGE_KEY = "runnation_weight_unit";

type WeightUnitContextValue = {
  weightUnit: WeightUnit;
  weightUnitLabel: string;
  weightUnitShortLabel: string;
  setWeightUnit: (unit: WeightUnit) => void;
  toggleWeightUnit: () => void;
};

const WeightUnitContext = createContext<WeightUnitContextValue | undefined>(undefined);

function normalizeWeightUnit(value: string | null): WeightUnit {
  return value === "lbs" ? "lbs" : "kg";
}

export function WeightUnitProvider({ children }: { children: React.ReactNode }) {
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>("kg");

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (mounted) setWeightUnitState(normalizeWeightUnit(stored));
      })
      .catch(() => {
        if (mounted) setWeightUnitState("kg");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setWeightUnit = useCallback((unit: WeightUnit) => {
    setWeightUnitState(unit);
    AsyncStorage.setItem(STORAGE_KEY, unit).catch((error) => {
      console.warn("[WeightUnit] Could not save preference:", error);
    });
  }, []);

  const toggleWeightUnit = useCallback(() => {
    setWeightUnit(weightUnit === "kg" ? "lbs" : "kg");
  }, [setWeightUnit, weightUnit]);

  const value = useMemo<WeightUnitContextValue>(
    () => ({
      weightUnit,
      weightUnitLabel: weightUnit === "lbs" ? "Pounds" : "Kilograms",
      weightUnitShortLabel: weightUnit,
      setWeightUnit,
      toggleWeightUnit,
    }),
    [setWeightUnit, toggleWeightUnit, weightUnit]
  );

  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>;
}

export function useWeightUnit(): WeightUnitContextValue {
  const context = useContext(WeightUnitContext);
  if (context) return context;

  return {
    weightUnit: "kg",
    weightUnitLabel: "Kilograms",
    weightUnitShortLabel: "kg",
    setWeightUnit: () => {},
    toggleWeightUnit: () => {},
  };
}
