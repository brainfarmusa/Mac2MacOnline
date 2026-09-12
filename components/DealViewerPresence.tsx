"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { pddSupabaseKey, pddSupabaseUrl } from "@/lib/pdd-auth";

type ViewerPresence = {
  color?: number;
  online_at?: string;
};

const viewerColors = ["#62c7f2", "#f6b84a", "#6bd19b", "#be8df0", "#ef7d7d", "#7ea6f4"];

function viewerKey(dealNumber: string) {
  const storageKey = `m2m-pdd-viewer-${dealNumber}`;
  const saved = sessionStorage.getItem(storageKey);
  if (saved) return saved;
  const created = crypto.randomUUID();
  sessionStorage.setItem(storageKey, created);
  return created;
}

export default function DealViewerPresence({ dealNumber, scopeLabel = "this deal" }: { dealNumber: string; scopeLabel?: string }) {
  const [viewers, setViewers] = useState<ViewerPresence[]>([]);
  const client = useMemo(
    () => createClient(pddSupabaseUrl, pddSupabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    [],
  );

  useEffect(() => {
    const key = viewerKey(dealNumber);
    const color = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0) % viewerColors.length;
    const channel = client.channel(`pdd-deal-${dealNumber.toLowerCase()}`, {
      config: { presence: { key } },
    });

    const syncViewers = () => {
      const presence = channel.presenceState<ViewerPresence>();
      setViewers(Object.values(presence).flat());
    };

    channel
      .on("presence", { event: "sync" }, syncViewers)
      .on("presence", { event: "join" }, syncViewers)
      .on("presence", { event: "leave" }, syncViewers)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ color, online_at: new Date().toISOString() });
        }
      });

    return () => {
      void channel.untrack();
      void client.removeChannel(channel);
    };
  }, [client, dealNumber]);

  if (!viewers.length) return null;
  const shown = viewers.slice(0, 6);
  const remaining = viewers.length - shown.length;

  return (
    <div className="dealViewerPresence" aria-label={`${viewers.length} ${viewers.length === 1 ? "person is" : "people are"} viewing ${scopeLabel}`}>
      <div className="dealViewerStack" aria-hidden="true">
        {shown.map((viewer, index) => (
          <span key={`${viewer.online_at || "viewer"}-${index}`} style={{ background: viewerColors[viewer.color ?? index % viewerColors.length] }}>
            {index + 1}
          </span>
        ))}
        {remaining > 0 && <b>+{remaining}</b>}
      </div>
      <strong>{viewers.length} viewing</strong>
    </div>
  );
}
