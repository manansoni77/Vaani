"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { Department, CreateDepartmentRequest, UpdateDepartmentRequest } from "@/lib/api";
import { getDepartments, createDepartment, updateDepartment } from "@/lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "vaani_departments";

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type DepartmentContextType = {
  departments: Department[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (data: CreateDepartmentRequest) => Promise<Department>;
  update: (id: number, data: UpdateDepartmentRequest) => Promise<Department>;
};

const DepartmentContext = createContext<DepartmentContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDepartments();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setDepartments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load departments");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // On mount: rehydrate from localStorage instantly, then fetch fresh data
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setDepartments(JSON.parse(raw) as Department[]);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    refetch();
  }, [refetch]);

  const create = useCallback(
    async (data: CreateDepartmentRequest): Promise<Department> => {
      const dept = await createDepartment(data);
      await refetch();
      return dept;
    },
    [refetch],
  );

  const update = useCallback(
    async (id: number, data: UpdateDepartmentRequest): Promise<Department> => {
      const dept = await updateDepartment(id, data);
      await refetch();
      return dept;
    },
    [refetch],
  );

  return (
    <DepartmentContext.Provider value={{ departments, isLoading, error, refetch, create, update }}>
      {children}
    </DepartmentContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDepartments(): DepartmentContextType {
  const ctx = useContext(DepartmentContext);
  if (!ctx) throw new Error("useDepartments must be used inside <DepartmentProvider>");
  return ctx;
}
