"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PackRun, PackRunStep } from "@/lib/types/analysis";

interface RunPollResult {
  run: PackRun | null;
  steps: PackRunStep[];
  isPolling: boolean;
  refresh: () => void;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "finalized"]);
const POLL_INTERVAL = 3000;

export function useRunPoller(runId: number | null): RunPollResult {
  const [run, setRun] = useState<PackRun | null>(null);
  const [steps, setSteps] = useState<PackRunStep[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await fetch(`/api/analysis-runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRun(data.run ?? data);
      setSteps(data.steps ?? []);

      const status = data.run?.status ?? data.status;
      if (status && TERMINAL_STATUSES.has(status)) {
        setIsPolling(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch (err) {
      console.error("Run poll error:", err);
    }
  }, [runId]);

  // Start/stop polling when runId changes
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!runId) {
      setRun(null);
      setSteps([]);
      setIsPolling(false);
      return;
    }

    // Initial fetch
    setIsPolling(true);
    fetchRun();

    timerRef.current = setInterval(fetchRun, POLL_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [runId, fetchRun]);

  return { run, steps, isPolling, refresh: fetchRun };
}
