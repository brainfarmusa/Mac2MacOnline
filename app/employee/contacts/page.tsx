"use client";
import { useEffect, useMemo, useState } from "react";
import {
  clearPddSession,
  currentPddSession,
  pddAuthFetch,
  pddSupabaseKey,
  pddSupabaseUrl,
  type PddSession,
} from "../../../lib/pdd-auth";
import ContactTemplateFields from "../../../components/ContactTemplateFields";
import DirectorySpreadsheetImport,{type DirectoryImportRow,type DirectoryImportResult} from "../../../components/DirectorySpreadsheetImport";
import BusinessRecordAttachments from "../../../components/BusinessRecordAttachments";
import BusinessRecordComments from "../../../components/BusinessRecordComments";
import BusinessRecordStatus from "../../../components/BusinessRecordStatus";
import CompanyContacts from "../../../components/CompanyContacts";
import {responseErrorMessage} from "../../../lib/spreadsheetFile";

type Vendor = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  created_by_name: string;
  created_by_email: string;
  updated_at: string;
};
type Customer = {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  updated_at: string;
  last_bid_at: string;
  bid_count: number;
  has_account: boolean;
  assigned_employee_name?: string;
  assigned_employee_email?: string;
};
type Employee = { email: string; display_name: string; active?: boolean };
type ContactDraft = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  assignedEmployeeEmail: string;
};
const emptyDraft: ContactDraft = {
  company: "",
  contactName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "United States",
  assignedEmployeeEmail: "",
};
const address = (item: {
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
}) =>
  [
    item.address1,
    item.address2,
    [item.city, item.region, item.postal_code].filter(Boolean).join(", "),
    item.country,
  ]
    .filter(Boolean)
    .join(" · ");
const date = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
const revealRecord = (key: string) => {
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() =>
      document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    ),
  );
};

export default function ContactsDirectory() {
  const [session, setSession] = useState<PddSession | null>(null),
    [vendors, setVendors] = useState<Vendor[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [employees, setEmployees] = useState<Employee[]>([]),
    [scope, setScope] = useState<"vendors" | "customers">("vendors"),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(""),
    [editing, setEditing] = useState(""),
    [creating, setCreating] = useState(false),
    [draft, setDraft] = useState<ContactDraft>(emptyDraft),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState(""),
    [isAdministrator, setIsAdministrator] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "customers") setScope("customers");
    if (params.get("new") === "1") setCreating(true);
  }, []);
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search),
      record = (params.get("record") || "").trim(),
      company = (params.get("company") || "").trim().toLowerCase();
    if ((!record && !company) || params.get("edit") !== "1") return;
    if (scope === "vendors") {
      const vendor = record
        ? vendors.find((item) => item.id === record)
        : vendors.find((item) => item.company_name.trim().toLowerCase() === company);
      if (!vendor) {
        setQuery(params.get("company") || "");
        setMessage("The matching vendor record could not be opened automatically.");
        return;
      }
      setQuery(vendor.company_name);
      setOpen(`v-${vendor.id}`);
      editVendor(vendor);
      revealRecord(`v-${vendor.id}`);
      return;
    }
    const customer = record
      ? customers.find((item) => item.id === record)
      : customers.find((item) => item.company.trim().toLowerCase() === company);
    if (!customer) {
      setQuery(params.get("company") || "");
      setMessage("The matching customer record could not be opened automatically.");
      return;
    }
    setQuery(customer.company || customer.email);
    setOpen(`c-${customer.id}`);
    editCustomer(customer);
    revealRecord(`c-${customer.id}`);
  }, [loading, scope, vendors, customers]);
  useEffect(() => {
    void (async () => {
      const active = await currentPddSession();
      if (!active) {
        window.location.replace("/employee-login?return_to=/employee/contacts");
        return;
      }
      setSession(active);
      const headers = { Authorization: `Bearer ${active.access_token}` };
      const [vendorResponse, customerResponse, employeeResponse] = await Promise.all([
        pddAuthFetch(
          "/rest/v1/pdd_vendors?select=id,company_name,contact_name,email,phone,address1,address2,city,region,postal_code,country,created_by_name,created_by_email,updated_at&order=company_name.asc",
          { headers },
        ),
        fetch("/api/admin/contacts", { headers }),
        fetch(`${pddSupabaseUrl}/functions/v1/admin-pdd-employees`, {
          headers: { ...headers, apikey: pddSupabaseKey, "Content-Type": "application/json" },
        }),
      ]);
      if (vendorResponse.status === 401 || customerResponse.status === 401) {
        clearPddSession();
        window.location.replace("/employee-login");
        return;
      }
      if (!vendorResponse.ok || !customerResponse.ok) {
        setMessage("The directory could not be loaded.");
        setLoading(false);
        return;
      }
      setVendors((await vendorResponse.json()) as Vendor[]);
      const customerData = (await customerResponse.json()) as {
        customers: Customer[];
        currentUserRole?: string;
      };
      setCustomers(customerData.customers || []);
      setIsAdministrator(customerData.currentUserRole === "administrator");
      if (employeeResponse.ok) {
        const data = (await employeeResponse.json()) as { employees?: Employee[] };
        setEmployees(
          (data.employees || [])
            .filter((item) => item.active !== false)
            .sort((a, b) => a.display_name.localeCompare(b.display_name)),
        );
      }
      setLoading(false);
    })();
  }, []);
  const normalized = query.trim().toLowerCase(),
    visibleVendors = useMemo(
      () =>
        vendors.filter(
          (v) =>
            !normalized ||
            Object.values(v).some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(normalized),
            ),
        ),
      [vendors, normalized],
    ),
    visibleCustomers = useMemo(
      () =>
        customers.filter(
          (v) =>
            !normalized ||
            Object.values(v).some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(normalized),
            ),
      ),
      [customers, normalized],
    ),
    vendorDownloadRows = useMemo(
      () =>
        vendors.map((vendor) => ({
          company: vendor.company_name,
          contact_name: vendor.contact_name,
          email: vendor.email,
          phone: vendor.phone,
          address1: vendor.address1,
          address2: vendor.address2,
          city: vendor.city,
          region: vendor.region,
          postal_code: vendor.postal_code,
          country: vendor.country,
          assigned_employee_email: vendor.created_by_email,
          assigned_employee_name: vendor.created_by_name,
          updated_at: vendor.updated_at,
        })),
      [vendors],
    ),
    customerDownloadRows = useMemo(
      () =>
        customers.map((customer) => ({
          company: customer.company,
          contact_name: customer.contact_name,
          email: customer.email,
          phone: customer.phone,
          address1: customer.address1,
          address2: customer.address2,
          city: customer.city,
          region: customer.region,
          postal_code: customer.postal_code,
          country: customer.country,
          assigned_employee_email: customer.assigned_employee_email,
          assigned_employee_name: customer.assigned_employee_name,
          bid_count: customer.bid_count,
          last_bid_at: customer.last_bid_at,
          has_account: customer.has_account,
          updated_at: customer.updated_at,
        })),
      [customers],
    ),
    items = scope === "vendors" ? visibleVendors : visibleCustomers;
  const field = (name: keyof ContactDraft, value: string) =>
    setDraft((current) => ({ ...current, [name]: value }));
  function editVendor(v: Vendor) {
    setEditing(`v-${v.id}`);
    setDraft({
      company: v.company_name,
      contactName: v.contact_name,
      email: v.email,
      phone: v.phone,
      address1: v.address1,
      address2: v.address2,
      city: v.city,
      region: v.region,
      postalCode: v.postal_code,
      country: v.country || "United States",
      assignedEmployeeEmail: v.created_by_email || "",
    });
    setMessage("");
  }
  function editCustomer(c: Customer) {
    setEditing(`c-${c.id}`);
    setDraft({
      company: c.company,
      contactName: c.contact_name,
      email: c.email,
      phone: c.phone,
      address1: c.address1,
      address2: c.address2,
      city: c.city,
      region: c.region,
      postalCode: c.postal_code,
      country: c.country || "United States",
      assignedEmployeeEmail: c.assigned_employee_email || "",
    });
    setMessage("");
  }
  async function saveVendor(v: Vendor) {
    if (!session || !draft.company.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const owner = employees.find((item) => item.email === draft.assignedEmployeeEmail),
        updatedAt = new Date().toISOString(),
        response = await pddAuthFetch(
          `/rest/v1/pdd_vendors?id=eq.${encodeURIComponent(v.id)}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              company_name: draft.company.trim(),
              contact_name: draft.contactName.trim(),
              email: draft.email.trim(),
              phone: draft.phone.trim(),
              address1: draft.address1.trim(),
              address2: draft.address2.trim(),
              city: draft.city.trim(),
              region: draft.region.trim(),
              postal_code: draft.postalCode.trim(),
              country: draft.country.trim() || "United States",
              created_by_name: owner?.display_name || "",
              created_by_email: owner?.email || "",
              updated_at: updatedAt,
            }),
          },
        );
      if (!response.ok) throw new Error("The vendor could not be updated.");
      const rows = (await response.json()) as Vendor[],
        saved = rows[0];
      if (!saved) throw new Error("The updated vendor could not be loaded.");
      setVendors((current) =>
        current.map((item) =>
          item.id === v.id ? { ...item, ...saved } : item,
        ),
      );
      setEditing("");
      setMessage(`${saved.company_name} was updated.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The vendor could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveCustomer(c: Customer) {
    if (!session || !draft.company.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contacts", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            id: c.id,
            hasAccount: c.has_account,
            assignedEmployeeName: employees.find((item) => item.email === draft.assignedEmployeeEmail)?.display_name || "",
            assignedEmployeeEmail: draft.assignedEmployeeEmail,
            ...draft,
          }),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The customer could not be updated.");
      const saved = data.customer as Partial<Customer>;
      setCustomers((current) =>
        current.map((item) =>
          item.id === c.id ? { ...item, ...saved } : item,
        ),
      );
      setEditing("");
      setMessage(`${draft.company.trim()} was updated.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The customer could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createCustomer() {
    if (!session || !draft.company.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contacts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...draft,
            assignedEmployeeName: employees.find((item) => item.email === draft.assignedEmployeeEmail)?.display_name || "",
          }),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The customer could not be added.");
      const saved = data.customer as Customer;
      setCustomers((current) =>
        [...current, saved].sort((a, b) =>
          (a.company || a.email).localeCompare(b.company || b.email),
        ),
      );
      setCreating(false);
      setDraft(emptyDraft);
      setMessage(`${saved.company} was added as a new customer.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The customer could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createVendor() {
    if (!session || !draft.company.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [userResponse, profileResponse] = await Promise.all([
        pddAuthFetch("/auth/v1/user", { headers }),
        pddAuthFetch("/rest/v1/pdd_employee_access?select=email,display_name", {
          headers,
        }),
      ]);
      if (!userResponse.ok || !profileResponse.ok)
        throw new Error("Your employee profile could not be loaded.");
      const user = (await userResponse.json()) as {
        id: string;
        email?: string;
      };
      const owner = employees.find((item) => item.email === draft.assignedEmployeeEmail);
      const response = await pddAuthFetch("/rest/v1/pdd_vendors", {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          company_name: draft.company.trim(),
          contact_name: draft.contactName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          address1: draft.address1.trim(),
          address2: draft.address2.trim(),
          city: draft.city.trim(),
          region: draft.region.trim(),
          postal_code: draft.postalCode.trim(),
          country: draft.country.trim() || "United States",
          created_by: user.id,
          created_by_name: owner?.display_name || "",
          created_by_email: owner?.email || "",
          updated_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error("The vendor could not be added.");
      const saved = ((await response.json()) as Vendor[])[0];
      if (!saved) throw new Error("The saved vendor could not be opened.");
      setVendors((current) =>
        [...current, saved].sort((a, b) =>
          a.company_name.localeCompare(b.company_name),
        ),
      );
      setCreating(false);
      setDraft(emptyDraft);
      setMessage(`${saved.company_name} was added as a new vendor.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The vendor could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteVendor(v: Vendor) {
    if (!session || !isAdministrator || deleting) return;
    const name = v.company_name || "this vendor";
    if (
      !window.confirm(
        `Delete vendor “${name}”?\n\nThis permanently removes the vendor record and cannot be undone.`,
      )
    )
      return;
    const key = `v-${v.id}`;
    setDeleting(key);
    setMessage("");
    try {
      const response = await pddAuthFetch(
        `/rest/v1/pdd_vendors?id=eq.${encodeURIComponent(v.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
        },
      );
      if (response.status === 409)
        throw new Error(
          `${name} cannot be deleted because it is used by an existing deal or purchase order.`,
        );
      if (!response.ok)
        throw new Error(
          await responseErrorMessage(response, "The vendor could not be deleted"),
        );
      const removed = (await response.json()) as Vendor[];
      if (!removed.some((item) => item.id === v.id))
        throw new Error("Only an administrator can delete vendors.");
      setVendors((current) => current.filter((item) => item.id !== v.id));
      setOpen("");
      setEditing("");
      setMessage(`${name} was deleted from the vendor directory.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The vendor could not be deleted.",
      );
    } finally {
      setDeleting("");
    }
  }
  async function deleteCustomer(c: Customer) {
    if (!session || !isAdministrator || deleting) return;
    const name = c.company || c.email || "this customer";
    if (
      !window.confirm(
        `Delete customer “${name}”?\n\nThis removes the customer from the directory and cannot be undone. Existing bid and account history will remain protected.`,
      )
    )
      return;
    const key = `c-${c.id}`;
    setDeleting(key);
    setMessage("");
    try {
      const response = await fetch("/api/admin/contacts", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ id: c.id, email: c.email, company: c.company }),
        }),
        data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "The customer could not be deleted.");
      setCustomers((current) => current.filter((item) => item.id !== c.id));
      setOpen("");
      setEditing("");
      setMessage(`${name} was deleted from the customer directory.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The customer could not be deleted.",
      );
    } finally {
      setDeleting("");
    }
  }
  async function importDirectory(rows:DirectoryImportRow[]):Promise<DirectoryImportResult>{
    if(!session)throw new Error("Your employee session has expired.");
    const result:DirectoryImportResult={added:0,updated:0,skipped:0,errors:[]},headers={Authorization:`Bearer ${session.access_token}`},clean=(value?:string)=>String(value||"").trim(),digits=(value?:string)=>clean(value).replace(/\D/g,"");
    const [userResponse,profileResponse]=await Promise.all([pddAuthFetch("/auth/v1/user",{headers}),pddAuthFetch("/rest/v1/pdd_employee_access?select=email,display_name",{headers})]);
    if(!userResponse.ok||!profileResponse.ok)throw new Error("Your employee profile could not be loaded.");
    const user=await userResponse.json() as {id:string},profile=((await profileResponse.json()) as Employee[])[0];
    for(const [index,row] of rows.entries()){
      const rowNumber=Number(row.__row_number)||index+2,rowLabel=`${row.__sheet_name?`“${row.__sheet_name}” `:""}row ${rowNumber}`,company=clean(row.company),email=clean(row.email).toLowerCase(),phone=clean(row.phone),owner=employees.find(item=>item.email.toLowerCase()===clean(row.assigned_employee_email).toLowerCase());
      if(!company){result.skipped++;continue}
      try{
        if(scope==="vendors"){
          const existing=vendors.find(item=>(email&&item.email.toLowerCase()===email)||(digits(phone)&&digits(item.phone)===digits(phone))||item.company_name.trim().toLowerCase()===company.toLowerCase());
          const value=(field:keyof DirectoryImportRow,fallback="")=>clean(row[field])||fallback;
          const payload={company_name:company,contact_name:value("contact_name",existing?.contact_name||""),email:value("email",existing?.email||""),phone:value("phone",existing?.phone||""),address1:value("address1",existing?.address1||""),address2:value("address2",existing?.address2||""),city:value("city",existing?.city||""),region:value("region",existing?.region||""),postal_code:value("postal_code",existing?.postal_code||""),country:value("country",existing?.country||"United States"),created_by_name:owner?.display_name||existing?.created_by_name||profile?.display_name||"",created_by_email:owner?.email||existing?.created_by_email||profile?.email||"",updated_at:new Date().toISOString()};
          if(!payload.contact_name||!payload.address1||!payload.city||!payload.region||!payload.postal_code){const missing=[["Contact Name",payload.contact_name],["Address 1",payload.address1],["City",payload.city],["State / Region",payload.region],["Postal Code",payload.postal_code]].filter(([,value])=>!value).map(([label])=>label);result.skipped++;result.errors.push(`${rowLabel} (${company}) is missing: ${missing.join(", ")}.`);continue}
          const response=await pddAuthFetch(existing?`/rest/v1/pdd_vendors?id=eq.${encodeURIComponent(existing.id)}`:"/rest/v1/pdd_vendors",{method:existing?"PATCH":"POST",headers:{...headers,Prefer:"return=representation"},body:JSON.stringify(existing?payload:{...payload,created_by:user.id})});
          if(!response.ok)throw new Error(`${rowLabel} (${company}) could not be saved: ${await responseErrorMessage(response,"the vendor record was rejected")}.`);
          const saved=((await response.json()) as Vendor[])[0];
          if(existing){setVendors(current=>current.map(item=>item.id===existing.id?{...item,...saved}:item));result.updated++}else{setVendors(current=>[...current,saved].sort((a,b)=>a.company_name.localeCompare(b.company_name)));result.added++}
        }else{
          const existing=customers.find(item=>(email&&item.email.toLowerCase()===email)||(digits(phone)&&digits(item.phone)===digits(phone))||item.company.trim().toLowerCase()===company.toLowerCase());
          const current=existing||({} as Customer),payload={id:existing?.id,hasAccount:existing?.has_account||false,company,contactName:clean(row.contact_name)||current.contact_name||"",email:clean(row.email)||current.email||"",phone:clean(row.phone)||current.phone||"",address1:clean(row.address1)||current.address1||"",address2:clean(row.address2)||current.address2||"",city:clean(row.city)||current.city||"",region:clean(row.region)||current.region||"",postalCode:clean(row.postal_code)||current.postal_code||"",country:clean(row.country)||current.country||"United States",assignedEmployeeName:owner?.display_name||current.assigned_employee_name||profile?.display_name||"",assignedEmployeeEmail:owner?.email||current.assigned_employee_email||profile?.email||""};
          const response=await fetch("/api/admin/contacts",{method:existing?"PATCH":"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(payload)}),data=await response.json();
          if(!response.ok)throw new Error(`${rowLabel} (${company}) could not be saved: ${data.error||"the customer record was rejected"}.`);
          const saved=data.customer as Customer;
          if(existing){setCustomers(currentRows=>currentRows.map(item=>item.id===existing.id?{...item,...saved}:item));result.updated++}else{setCustomers(currentRows=>[...currentRows,saved].sort((a,b)=>(a.company||a.email).localeCompare(b.company||b.email)));result.added++}
        }
      }catch(error){result.skipped++;result.errors.push(error instanceof Error?error.message:`${rowLabel} could not be saved.`)}
    }
    return result;
  }
  const editor = (onSave: () => void) => (
    <form
      className="contactDirectoryEditor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label className="requiredEntryField">
        <span>Company <b className="requiredAsterisk" aria-hidden="true">*</b></span>
        <input
          required
          value={draft.company}
          onChange={(event) => field("company", event.target.value)}
        />
      </label>
      <label>
        Contact name
        <input
          value={draft.contactName}
          onChange={(event) => field("contactName", event.target.value)}
        />
      </label>
      <label>
        Email
        <input
          type="text"
          inputMode="email"
          placeholder="name@company.com, second@company.com"
          value={draft.email}
          onChange={(event) => field("email", event.target.value)}
        />
      </label>
      <label className="wide">
        Address
        <input
          value={draft.address1}
          onChange={(event) => field("address1", event.target.value)}
        />
      </label>
      <label className="wide">
        Address line 2
        <input
          value={draft.address2}
          onChange={(event) => field("address2", event.target.value)}
        />
      </label>
      <ContactTemplateFields
        phone={draft.phone}
        city={draft.city}
        region={draft.region}
        country={draft.country}
        onChange={(name, value) => field(name, value)}
      />
      <label>
        Assigned employee
        <select
          value={draft.assignedEmployeeEmail}
          onChange={(event) => field("assignedEmployeeEmail", event.target.value)}
        >
          <option value="">Unassigned</option>
          {employees.map((employee) => (
            <option key={employee.email} value={employee.email}>
              {employee.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        ZIP / Postal code
        <input
          value={draft.postalCode}
          onChange={(event) => field("postalCode", event.target.value)}
        />
      </label>
      <div className="contactDirectoryEditActions">
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setEditing("");
            setCreating(false);
          }}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button"
          disabled={saving || !draft.company.trim()}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
  return (
    <main className="contactDirectoryPage">
      <header>
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h1>Vendors &amp; Customers</h1>
          <p>
            Look up and update complete company, contact and address information
            in one place.
          </p>
        </div>
        <a href="/employee">← Dashboard</a>
      </header>
      <section className="contactDirectoryStats">
        <article>
          <strong>{vendors.length}</strong>
          <span>Vendors</span>
        </article>
        <article>
          <strong>{customers.length}</strong>
          <span>Customers</span>
        </article>
        <article>
          <strong>{vendors.filter((v) => v.created_by_name).length}</strong>
          <span>Assigned vendors</span>
        </article>
      </section>
      <section className="contactDirectoryTools">
        <div className="contactDirectoryTabs">
          <button
            className={scope === "vendors" ? "active" : ""}
            onClick={() => {
              setScope("vendors");
              setOpen("");
              setEditing("");
              setCreating(false);
            }}
          >
            Vendors <span>{vendors.length}</span>
          </button>
          <button
            className={scope === "customers" ? "active" : ""}
            onClick={() => {
              setScope("customers");
              setOpen("");
              setEditing("");
              setCreating(false);
            }}
          >
            Customers <span>{customers.length}</span>
          </button>
        </div>
        <label>
          Search directory
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Company, contact, email, phone, city or employee"
          />
        </label>
      </section>
      {message && <p className="contactDirectoryMessage">{message}</p>}
      {loading ? (
        <div className="contactDirectoryEmpty">
          Loading vendors and customers…
        </div>
      ) : (
        <section className="contactDirectoryList">
          <div className="contactDirectoryHeading">
            <h2>
              {scope === "vendors" ? "Vendor database" : "Customer database"}
            </h2>
            <button
              className="button"
              type="button"
              onClick={() => {
                setCreating(true);
                setEditing("");
                setDraft(emptyDraft);
              }}
            >
              + New {scope === "vendors" ? "Vendor" : "Customer"}
            </button>
            <span>{items.length} shown</span>
          </div>
          <DirectorySpreadsheetImport kind={scope==="vendors"?"vendor":"customer"} label={scope==="vendors"?"Vendor":"Customer"} onImport={importDirectory} downloadRows={scope==="vendors"?vendorDownloadRows:customerDownloadRows}/>
          {creating && (
            <div className="contactDirectoryDetails">
              <h3>Add New {scope === "vendors" ? "Vendor" : "Customer"}</h3>
              {editor(
                () =>
                  void (scope === "vendors"
                    ? createVendor()
                    : createCustomer()),
              )}
            </div>
          )}
          {scope === "vendors"
            ? visibleVendors.map((v) => {
                const key = `v-${v.id}`;
                return (
                  <article id={key} key={v.id} className={open === key ? "open" : ""}>
                    <button
                      className="contactDirectorySummary"
                      onClick={() => {
                        setOpen(open === key ? "" : key);
                        setEditing("");
                      }}
                      aria-expanded={open === key}
                    >
                      <div>
                        <span>VENDOR</span>
                        <h3>{v.company_name}</h3>
                        <p>
                          {v.contact_name || "No contact name"} ·{" "}
                          {[v.city, v.region].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <div>
                        <b>{v.created_by_name || "Unassigned"}</b>
                        <small>Assigned employee</small>
                      </div>
                      <strong>{open === key ? "Close" : "View details"}</strong>
                    </button>
                    {open === key && (
                      <div className="contactDirectoryDetails">
                        {editing === key ? (
                          editor(() => void saveVendor(v))
                        ) : (
                          <>
                            <dl>
                              <div>
                                <dt>Contact</dt>
                                <dd>{v.contact_name || "—"}</dd>
                              </div>
                              <div>
                                <dt>Email</dt>
                                <dd>
                                  {v.email ? (
                                    <a
                                      href={`mailto:${v.email}`}
                                    >
                                      {v.email}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>Phone</dt>
                                <dd>
                                  {v.phone ? (
                                    <a href={`tel:${v.phone}`}>{v.phone}</a>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>Address</dt>
                                <dd>{address(v) || "—"}</dd>
                              </div>
                              <div>
                                <dt>Assigned to</dt>
                                <dd>
                                  {v.created_by_name}
                                  <small>{v.created_by_email}</small>
                                </dd>
                              </div>
                              <div>
                                <dt>Last updated</dt>
                                <dd>{date(v.updated_at)}</dd>
                              </div>
                            </dl>
                            <CompanyContacts recordType="vendor" recordId={v.id} session={session} initialContact={{contactName:v.contact_name,jobTitle:"",email:v.email,phone:v.phone,isPrimary:true}} initialAddress={{billingAddress1:v.address1,billingAddress2:v.address2,billingCity:v.city,billingRegion:v.region,billingPostalCode:v.postal_code,billingCountry:v.country,shippingSameAsBilling:true}}/>
                            <BusinessRecordStatus recordType="vendor" recordId={v.id} session={session}/>
                            <BusinessRecordComments recordType="vendor" recordId={v.id} session={session}/>
                            <BusinessRecordAttachments recordType="vendor" recordId={v.id} recordName={v.company_name} session={session} isAdministrator={isAdministrator}/>
                            <div className="contactDirectoryActions">
                              <button
                                className="button"
                                type="button"
                                onClick={() => editVendor(v)}
                              >
                                Edit Vendor
                              </button>
                              {isAdministrator && (
                                <button
                                  className="button dangerButton"
                                  type="button"
                                  disabled={Boolean(deleting)}
                                  onClick={() => void deleteVendor(v)}
                                >
                                  {deleting === key ? "Deleting…" : "Delete Vendor"}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            : visibleCustomers.map((c) => {
                const key = `c-${c.id}`;
                return (
                  <article id={key} key={c.id} className={open === key ? "open" : ""}>
                    <button
                      className="contactDirectorySummary"
                      onClick={() => {
                        setOpen(open === key ? "" : key);
                        setEditing("");
                      }}
                      aria-expanded={open === key}
                    >
                      <div>
                        <span>CUSTOMER</span>
                        <h3>{c.company || c.email || "Unnamed customer"}</h3>
                        <p>
                          {c.contact_name || "No contact name"} ·{" "}
                          {[c.city, c.region].filter(Boolean).join(", ") ||
                            "No city entered"}
                        </p>
                      </div>
                      <div>
                        <b>
                          {c.assigned_employee_name ||
                            `${c.bid_count} ${c.bid_count === 1 ? "bid" : "bids"}`}
                        </b>
                        <small>
                          {c.assigned_employee_name
                            ? "Assigned employee"
                            : c.has_account
                              ? "Customer account"
                              : "Bid contact"}
                        </small>
                      </div>
                      <strong>{open === key ? "Close" : "View details"}</strong>
                    </button>
                    {open === key && (
                      <div className="contactDirectoryDetails">
                        {editing === key ? (
                          editor(() => void saveCustomer(c))
                        ) : (
                          <>
                            <dl>
                              <div>
                                <dt>Contact</dt>
                                <dd>{c.contact_name || "—"}</dd>
                              </div>
                              <div>
                                <dt>Email</dt>
                                <dd>
                                  {c.email ? (
                                    <a href={`mailto:${c.email}`}>{c.email}</a>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>Phone</dt>
                                <dd>
                                  {c.phone ? (
                                    <a href={`tel:${c.phone}`}>{c.phone}</a>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>Address</dt>
                                <dd>{address(c) || "—"}</dd>
                              </div>
                              <div>
                                <dt>Assigned to</dt>
                                <dd>
                                  {c.assigned_employee_name || "Unassigned"}
                                  {c.assigned_employee_email && (
                                    <small>{c.assigned_employee_email}</small>
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>Customer record</dt>
                                <dd>
                                  {c.has_account
                                    ? "Activated customer account"
                                    : c.assigned_employee_name
                                      ? "Imported customer"
                                      : "Created from a submitted bid"}
                                </dd>
                              </div>
                              <div>
                                <dt>Last bid</dt>
                                <dd>{date(c.last_bid_at)}</dd>
                              </div>
                            </dl>
                            <CompanyContacts recordType="customer" recordId={c.id} session={session} initialContact={{contactName:c.contact_name,jobTitle:"",email:c.email,phone:c.phone,isPrimary:true}} initialAddress={{billingAddress1:c.address1,billingAddress2:c.address2,billingCity:c.city,billingRegion:c.region,billingPostalCode:c.postal_code,billingCountry:c.country,shippingSameAsBilling:true}}/>
                            <BusinessRecordStatus recordType="customer" recordId={c.id} session={session}/>
                            <BusinessRecordComments recordType="customer" recordId={c.id} session={session}/>
                            <BusinessRecordAttachments recordType="customer" recordId={c.id} recordName={c.company||c.email} session={session} isAdministrator={isAdministrator}/>
                            <div className="contactDirectoryActions">
                              <button
                                className="button"
                                type="button"
                                onClick={() => editCustomer(c)}
                              >
                                Edit Customer
                              </button>
                              {isAdministrator && (
                                <button
                                  className="button dangerButton"
                                  type="button"
                                  disabled={Boolean(deleting)}
                                  onClick={() => void deleteCustomer(c)}
                                >
                                  {deleting === key
                                    ? "Deleting…"
                                    : "Delete Customer"}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
          {!items.length && (
            <div className="contactDirectoryEmpty">
              No {scope} match that search.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
