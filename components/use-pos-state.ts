"use client";

import { useEffect, useRef, useState } from "react";
import { createDefaultState, normalizeState, STATE_API_ENDPOINT, STORAGE_KEY, type PosState } from "@/lib/pos-data";

type SyncStatus = "loading" | "local" | "saving" | "saved" | "error" | "conflict";

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!Array.isArray(record?.menus)) return null;
    const sync = record.centralSync;
    return {
      state: normalizeState(record),
      revision: typeof sync?.revision === "string" ? sync.revision : null,
      pending: typeof sync?.pending === "boolean" ? sync.pending : true,
    };
  } catch {
    return null;
  }
}

function compareState(state: PosState) {
  return JSON.stringify(state, (_key, value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
  });
}

export function usePosState() {
  const [state, setState] = useState<PosState>(createDefaultState);
  const [loadedState, setLoadedState] = useState<PosState | null>(null);
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [cacheError, setCacheError] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const base = useRef<{ revision: string | null; serialized: string | null }>({ revision: null, serialized: null });
  const connected = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    const abort = new AbortController();
    const cache = loadCache();

    async function load() {
      let next: PosState;
      try {
        const response = await fetch(STATE_API_ENDPOINT, { cache: "no-store", signal: abort.signal });
        const revision = response.headers.get("ETag");
        if (!response.ok || !revision) throw new Error("Central state is unavailable");
        const central = normalizeState(await response.json());
        if (abort.signal.aborted) return;

        const hasDifferentWork = cache?.pending && compareState(cache.state) !== compareState(central);
        if (hasDifferentWork && cache.revision !== revision) {
          next = cache.state;
          base.current = { revision: cache.revision, serialized: null };
          setStatus("conflict");
        } else {
          connected.current = true;
          base.current = { revision, serialized: JSON.stringify(central) };
          next = hasDifferentWork ? cache.state : central;
          setStatus(hasDifferentWork ? "saving" : "saved");
        }
      } catch {
        if (abort.signal.aborted) return;
        next = cache?.state ?? createDefaultState();
        base.current = { revision: cache?.revision ?? null, serialized: cache?.pending ? null : JSON.stringify(next) };
        setStatus("local");
      }
      setState(next);
      setLoadedState(next);
    }

    void load();
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!loadedState) return;
    const serialized = JSON.stringify(state);
    const { revision } = base.current;
    const pending = serialized !== base.current.serialized;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, centralSync: { revision, pending } }));
      setCacheError(false);
    } catch {
      setCacheError(true);
    }

    if (!pending || !connected.current || !revision || saving.current) return;
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      saving.current = true;
      try {
        const response = await fetch(STATE_API_ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "If-Match": revision },
          body: serialized,
        });
        if (response.status === 409 || response.status === 428) {
          connected.current = false;
          setStatus("conflict");
          return;
        }
        const nextRevision = response.headers.get("ETag");
        if (!response.ok || !nextRevision) throw new Error("Central save failed");
        base.current = { revision: nextRevision, serialized };
        setStatus("saved");
        setSaveAttempt((attempt) => attempt + 1);
      } catch {
        setStatus("error");
      } finally {
        saving.current = false;
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadedState, saveAttempt, state]);

  function retrySync() {
    if (connected.current) setSaveAttempt((attempt) => attempt + 1);
    else if (!cacheError) window.location.reload();
  }

  return { state, setState, loadedState, status, cacheError, retrySync };
}
