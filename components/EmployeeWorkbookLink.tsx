"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { currentPddEmployeeEmail, currentPddSession, pddAuthFetch } from "@/lib/pdd-auth";

export default function EmployeeWorkbookLink() {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await currentPddSession();
      if (!session) return;
      const email = await currentPddEmployeeEmail(session);
      if (!email) return;
      const response = await pddAuthFetch(
        `/rest/v1/pdd_employee_access?select=role&email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!response.ok) return;
      const employees = (await response.json()) as { role: string }[];
      if (active && employees.length > 0) setAuthorized(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  return authorized ? <Link href="/employee">Deal Workbook</Link> : null;
}
