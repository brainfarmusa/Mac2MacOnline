"use client";
import {
  FormEvent,
  Fragment,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearPddSession,
  currentPddEmployeeEmail,
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
import CompanyContacts from "../../../components/CompanyContacts";
import {responseErrorMessage} from "../../../lib/spreadsheetFile";


const markets = [
  "Aerospace",
  "Government Subcontractor",
  "Large End User",
  "Medical",
  "Military & Defense",
  "Other",
  "Prime Contractor",
  "Robotics",
  "Small & Medium End User",
  "State & Federal Agency",
  "University",
];
const statuses = [
  "contacted",
  "customer",
  "new",
  "opportunity",
  "awaiting_response",
  "submitted_request",
  "vendor_approved",
  "qualified",
  "researching",
];
type Employee = {
  email: string;
  display_name: string;
  role: "administrator" | "employee";
};
type Prospect = {
  id: string;
  prospect_type: "end_user" | "oem" | "broker" | "international";
  company_name: string;
  website: string;
  contact_name: string;
  job_title: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  market: string;
  organization_size: string;
  government_level: string;
  contractor_type: string;
  naics_codes: string;
  source: string;
  status: string;
  priority: string;
  assigned_employee_name: string;
  assigned_employee_email: string;
  follow_up_date: string | null;
  opportunity_notes: string;
  last_contacted_at: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  locations: string;
  organization_role: string;
  business_focus: string;
  product_fit: string;
  product_angles: string;
  supplier_entry_method: string;
  supplier_requirements: string;
  supplier_watchouts: string;
  recommended_next_move: string;
  supplier_url: string;
  secondary_source_url: string;
  application_submitted: boolean;
  application_submitted_date: string | null;
  application_status: string;
  sell_to_prospect: boolean;
  buy_from_prospect: boolean;
  trade_in_candidate: boolean;
};
type Draft = {
  company_name: string;
  website: string;
  contact_name: string;
  job_title: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  market: string;
  organization_size: string;
  government_level: string;
  contractor_type: string;
  naics_codes: string;
  source: string;
  status: string;
  priority: string;
  assigned_employee_email: string;
  follow_up_date: string;
  opportunity_notes: string;
  locations: string;
  organization_role: string;
  business_focus: string;
  product_fit: string;
  product_angles: string;
  supplier_entry_method: string;
  supplier_requirements: string;
  supplier_watchouts: string;
  recommended_next_move: string;
  supplier_url: string;
  secondary_source_url: string;
  application_submitted: boolean;
  application_submitted_date: string;
  application_status: string;
  sell_to_prospect: boolean;
  buy_from_prospect: boolean;
  trade_in_candidate: boolean;
};
const blank: Draft = {
  company_name: "",
  website: "",
  contact_name: "",
  job_title: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "United States",
  market: "Aerospace",
  organization_size: "Unknown",
  government_level: "None",
  contractor_type: "None",
  naics_codes: "",
  source: "",
  status: "new",
  priority: "medium",
  assigned_employee_email: "",
  follow_up_date: "",
  opportunity_notes: "",
  locations: "",
  organization_role: "",
  business_focus: "",
  product_fit: "",
  product_angles: "",
  supplier_entry_method: "",
  supplier_requirements: "",
  supplier_watchouts: "",
  recommended_next_move: "",
  supplier_url: "",
  secondary_source_url: "",
  application_submitted: false,
  application_submitted_date: "",
  application_status: "not_started",
  sell_to_prospect: true,
  buy_from_prospect: true,
  trade_in_candidate: true,
};
const pretty = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const websitePattern =
  /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+(?:com|org|net|gov|edu|mil|ai|io|co)(?:\/[^\s<]*)?)/gi;
const websiteHref = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

function LinkedValue({ text, href }: { text: string; href?: string }) {
  const value = String(text || "").trim();
  if (!value) return <>—</>;
  if (href)
    return (
      <a
        className="prospectInlineLink"
        href={websiteHref(href)}
        target="_blank"
        rel="noreferrer"
      >
        {value} ↗
      </a>
    );
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(websitePattern)) {
    const start = match.index ?? 0,
      raw = match[0],
      clean = raw.replace(/[),.;!?]+$/g, ""),
      trailing = raw.slice(clean.length);
    if (start > lastIndex) parts.push(value.slice(lastIndex, start));
    parts.push(
      <a
        className="prospectInlineLink"
        href={websiteHref(clean)}
        target="_blank"
        rel="noreferrer"
        key={`${start}-${clean}`}
      >
        {clean} ↗
      </a>,
    );
    if (trailing) parts.push(trailing);
    lastIndex = start + raw.length;
  }
  if (!parts.length) return <>{value}</>;
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
}

export default function EndUserCustomers() {
  const [directoryType, setDirectoryType] = useState<"end_user" | "oem" | "broker" | "international">("end_user"),
    [session, setSession] = useState<PddSession | null>(null),
    [profile, setProfile] = useState<Employee | null>(null),
    [employees, setEmployees] = useState<Employee[]>([]),
    [prospects, setProspects] = useState<Prospect[]>([]),
    [draft, setDraft] = useState<Draft>(blank),
    [editingId, setEditingId] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [marketFilter, setMarketFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [showForm, setShowForm] = useState(false),
    [busy, setBusy] = useState(false),
    [deletingId, setDeletingId] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get("type");
    const type = requestedType === "oem" || requestedType === "broker" || requestedType === "international" ? requestedType : "end_user";
    setDirectoryType(type);
    void load(type);
  }, []);
  async function load(type: "end_user" | "oem" | "broker" | "international") {
    const active = await currentPddSession();
    if (!active) {
      window.location.replace(
        `/employee-login?return_to=${encodeURIComponent(`/employee/end-user-customers${type === "end_user" ? "" : `?type=${type}`}`)}`,
      );
      return;
    }
    setSession(active);
    const currentEmail = await currentPddEmployeeEmail(active);
    if (!currentEmail) {
      clearPddSession();
      window.location.replace("/employee-login");
      return;
    }
    const headers = { Authorization: `Bearer ${active.access_token}` };
    const [profileResponse, employeeResponse, prospectResponse] =
      await Promise.all([
        pddAuthFetch(
          `/rest/v1/pdd_employee_access?select=email,display_name,role&email=eq.${encodeURIComponent(currentEmail)}&active=eq.true&limit=1`,
          { headers },
        ),
        fetch(`${pddSupabaseUrl}/functions/v1/admin-pdd-employees`, {
          headers: {
            ...headers,
            apikey: pddSupabaseKey,
            "Content-Type": "application/json",
          },
        }),
        pddAuthFetch(
          `/rest/v1/pdd_end_user_prospects?prospect_type=eq.${type}&select=*&order=company_name.asc`,
          { headers },
        ),
      ]);
    if (profileResponse.status === 401 || prospectResponse.status === 401) {
      clearPddSession();
      window.location.replace("/employee-login");
      return;
    }
    if (!profileResponse.ok || !prospectResponse.ok) {
      setMessage("The prospect directory could not be loaded.");
      setLoading(false);
      return;
    }
    const profiles = (await profileResponse.json()) as Employee[];
    const employeeData = employeeResponse.ok
      ? ((await employeeResponse.json()) as { employees?: Employee[] })
      : {};
    const team = (employeeData.employees || profiles).sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
    setProfile(profiles[0] || null);
    setEmployees(team);
    setProspects((await prospectResponse.json()) as Prospect[]);
    setDraft((current) => ({
      ...current,
      assigned_employee_email: profiles[0]?.email || "",
    }));
    setLoading(false);
  }
  function field<K extends keyof Draft>(name: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
  }
  async function saveProspect(closeAfterSave = true) {
    if (!session || !profile || !draft.company_name.trim()) return;
    setBusy(true);
    setMessage("");
    const owner = employees.find(
      (item) => item.email === draft.assigned_employee_email,
    );
    const record = {
      ...draft,
      prospect_type: directoryType,
      company_name: draft.company_name.trim(),
      website: draft.website.trim(),
      contact_name: draft.contact_name.trim(),
      job_title: draft.job_title.trim(),
      email: draft.email.trim().toLowerCase(),
      phone: draft.phone.trim(),
      address1: draft.address1.trim(),
      address2: draft.address2.trim(),
      city: draft.city.trim(),
      region: draft.region.trim(),
      postal_code: draft.postal_code.trim(),
      country: draft.country.trim() || "United States",
      naics_codes: draft.naics_codes.trim(),
      source: draft.source.trim(),
      follow_up_date: draft.follow_up_date || null,
      application_submitted_date: draft.application_submitted_date || null,
      application_status:
        draft.application_submitted &&
        draft.application_status === "not_started"
          ? "submitted"
          : draft.application_status,
      opportunity_notes: draft.opportunity_notes.trim(),
      assigned_employee_name: owner?.display_name || "",
    };
    const endpoint = editingId
      ? `/rest/v1/pdd_end_user_prospects?id=eq.${encodeURIComponent(editingId)}`
      : "/rest/v1/pdd_end_user_prospects";
    const payload = editingId
      ? { ...record, updated_at: new Date().toISOString() }
      : {
          ...record,
          created_by: session.user.id,
          created_by_name: profile.display_name,
          created_by_email: profile.email,
        };
    try {
      const response = await pddAuthFetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          `The prospect could not be ${editingId ? "updated" : "saved"}.`,
        );
      const rows = (await response.json()) as Prospect[],
        saved = rows[0];
      if (editingId)
        setProspects((current) =>
          current.map((item) => (item.id === editingId ? saved || item : item)),
        );
      else setProspects((current) => [saved, ...current].filter(Boolean));
      if (closeAfterSave) {
        setDraft({ ...blank, assigned_employee_email: profile.email });
        setEditingId(null);
        setShowForm(false);
      }
      setMessage(
        `${saved?.company_name || record.company_name} was ${editingId ? "updated" : `added to the ${directoryType === "oem" ? "OEM" : directoryType === "broker" ? "broker" : directoryType === "international" ? "international" : "end-user"} prospect directory`}.`,
      );
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The prospect could not be saved.",
      );
    } finally {
      setBusy(false);
    }
    return false;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveProspect();
  }
  function editProspect(prospect: Prospect) {
    setDraft({
      ...blank,
      ...prospect,
      follow_up_date: prospect.follow_up_date || "",
      application_submitted_date: prospect.application_submitted_date || "",
    });
    setEditingId(prospect.id);
    setShowForm(true);
    setMessage(`Editing ${prospect.company_name}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function duplicateProspect() {
    const company = draft.company_name;
    setEditingId(null);
    setShowForm(true);
    setMessage(
      `Duplicate of ${company} is ready. Review it, then select Save Prospect to create the new record.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function closeForm() {
    setDraft({ ...blank, assigned_employee_email: profile?.email || "" });
    setEditingId(null);
    setShowForm(false);
  }
  async function editNextProspect() {
    if (!editingId || busy) return;
    const currentIndex = visible.findIndex((item) => item.id === editingId);
    const next = currentIndex >= 0 ? visible[currentIndex + 1] : undefined;
    if (!next) {
      setMessage("This is the last prospect in the current list.");
      return;
    }
    const saveFirst = window.confirm(
      "Save your changes before moving to the next prospect?\n\nSelect OK to save, or Cancel to move on without saving.",
    );
    if (saveFirst && !(await saveProspect(false))) return;
    editProspect(next);
  }
  async function addNewProspect() {
    if (busy) return;
    if (editingId) {
      const saveFirst = window.confirm(
        "Save your changes before adding a new prospect?\n\nSelect OK to save, or Cancel to open a blank record without saving.",
      );
      if (saveFirst && !(await saveProspect(false))) return;
    }
    setDraft({ ...blank, assigned_employee_email: profile?.email || "" });
    setEditingId(null);
    setShowForm(true);
    setMessage("Enter the new prospect information.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function importProspects(rows:DirectoryImportRow[]):Promise<DirectoryImportResult>{
    if(!session||!profile)throw new Error("Your employee session has expired.");
    const result:DirectoryImportResult={added:0,updated:0,skipped:0,errors:[]},headers={Authorization:`Bearer ${session.access_token}`},clean=(value?:string)=>String(value||"").trim(),digits=(value?:string)=>clean(value).replace(/\D/g,""),flag=(value:string|undefined,fallback:boolean)=>value===undefined||clean(value)===""?fallback:/^(1|true|yes|y)$/i.test(clean(value));
    const userResponse=await pddAuthFetch("/auth/v1/user",{headers});
    if(!userResponse.ok)throw new Error("Your employee profile could not be loaded.");
    const user=await userResponse.json() as {id:string};
    const choice=(value:string|undefined,allowed:string[],fallback:string,aliases:Record<string,string>={})=>{
      const raw=clean(value),match=allowed.find(item=>item.toLowerCase()===raw.toLowerCase());
      return match||aliases[raw.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()]||fallback;
    };
    const marketAliases={"military defense":"Military & Defense","defense":"Military & Defense","military":"Military & Defense","oem":"Other","original equipment manufacturer":"Other","technology":"Other","computer hardware":"Other","semiconductor":"Other"};
    const sizeAliases={"large enterprise":"Enterprise","mid to large enterprise":"Enterprise","mid large enterprise":"Enterprise","small business":"Small","medium business":"Medium","large business":"Large"};
    const contractorAliases={"defense contractor subcontractor":"Both","defense contractor":"Prime Contractor","prime":"Prime Contractor","sub contractor":"Subcontractor","n a":"None","na":"None"};
    for(const [index,row] of rows.entries()){
      const rowNumber=Number(row.__row_number)||index+2,rowLabel=`${row.__sheet_name?`“${row.__sheet_name}” `:""}row ${rowNumber}`,company=clean(row.company),email=clean(row.email).toLowerCase(),phone=clean(row.phone),existing=prospects.find(item=>(email&&item.email.toLowerCase()===email)||(digits(phone)&&digits(item.phone)===digits(phone))||item.company_name.trim().toLowerCase()===company.toLowerCase()),owner=employees.find(item=>item.email.toLowerCase()===clean(row.assigned_employee_email).toLowerCase());
      if(!company){result.skipped++;continue}
      const current=existing||({} as Prospect),value=(field:string,fallback="")=>clean(row[field])||fallback;
      const record={
        prospect_type:directoryType,company_name:company,website:value("website",current.website),contact_name:value("contact_name",current.contact_name),job_title:value("job_title",current.job_title),email:value("email",current.email).toLowerCase(),phone:value("phone",current.phone),address1:value("address1",current.address1),address2:value("address2",current.address2),city:value("city",current.city),region:value("region",current.region),postal_code:value("postal_code",current.postal_code),country:value("country",current.country||"United States"),market:choice(row.market,["Aerospace","Military & Defense","Robotics","Medical","Prime Contractor","Government Subcontractor","State & Federal Agency","University","Small & Medium End User","Large End User","Other"],current.market||"Other",marketAliases),organization_size:choice(row.organization_size,["Small","Medium","Large","Enterprise","Unknown"],current.organization_size||"Unknown",sizeAliases),government_level:choice(row.government_level,["None","State","Federal","State & Federal","Unknown"],current.government_level||"Unknown",{"n a":"None","na":"None","state federal":"State & Federal"}),contractor_type:choice(row.contractor_type,["None","Prime Contractor","Subcontractor","Both","Unknown"],current.contractor_type||"Unknown",contractorAliases),naics_codes:value("naics_codes",current.naics_codes),source:value("source",current.source||"Spreadsheet import"),status:choice(value("status",current.status||"new").toLowerCase().replaceAll(" ","_"),["new","researching","contacted","qualified","opportunity","customer","not_a_fit"],current.status||"new",{"prospect":"new","not a fit":"not_a_fit"}),priority:choice(value("priority",current.priority||"medium").toLowerCase(),["low","medium","high"],current.priority||"medium"),assigned_employee_name:owner?.display_name||current.assigned_employee_name||profile.display_name,assigned_employee_email:owner?.email||current.assigned_employee_email||profile.email,follow_up_date:value("follow_up_date",current.follow_up_date||"")||null,opportunity_notes:value("opportunity_notes",current.opportunity_notes),locations:value("locations",current.locations),organization_role:value("organization_role",current.organization_role),business_focus:value("business_focus",current.business_focus),product_fit:value("product_fit",current.product_fit),product_angles:value("product_angles",current.product_angles),supplier_entry_method:value("supplier_entry_method",current.supplier_entry_method),supplier_requirements:value("supplier_requirements",current.supplier_requirements),supplier_watchouts:value("supplier_watchouts",current.supplier_watchouts),recommended_next_move:value("recommended_next_move",current.recommended_next_move),supplier_url:value("supplier_url",current.supplier_url),secondary_source_url:value("secondary_source_url",current.secondary_source_url),application_submitted:flag(row.application_submitted,current.application_submitted||false),application_submitted_date:value("application_submitted_date",current.application_submitted_date||"")||null,application_status:choice(value("application_status",current.application_status||"not_started").toLowerCase().replaceAll(" ","_"),["not_started","submitted","under_review","registered","approved","not_available","rejected"],current.application_status||"not_started",{"not started":"not_started","under review":"under_review","not available":"not_available"}),sell_to_prospect:flag(row.sell_to_prospect,current.sell_to_prospect??true),buy_from_prospect:flag(row.buy_from_prospect,current.buy_from_prospect??true),trade_in_candidate:flag(row.trade_in_candidate,current.trade_in_candidate??true),updated_at:new Date().toISOString(),
      };
      try{
        const response=await pddAuthFetch(existing?`/rest/v1/pdd_end_user_prospects?id=eq.${encodeURIComponent(existing.id)}`:"/rest/v1/pdd_end_user_prospects",{method:existing?"PATCH":"POST",headers:{...headers,Prefer:"return=representation"},body:JSON.stringify(existing?record:{...record,created_by:user.id,created_by_name:profile.display_name,created_by_email:profile.email})});
        if(!response.ok)throw new Error(`${rowLabel} (${company}) could not be saved: ${await responseErrorMessage(response,"the prospect record was rejected")}.`)
        const saved=((await response.json()) as Prospect[])[0];
        if(existing){setProspects(currentRows=>currentRows.map(item=>item.id===existing.id?{...item,...saved}:item));result.updated++}else{setProspects(currentRows=>[...currentRows,saved]);result.added++}
      }catch(error){result.skipped++;result.errors.push(error instanceof Error?error.message:`${rowLabel} could not be saved.`)}
    }
    return result;
  }
  async function updateStatus(prospect: Prospect, status: string) {
    if (!session) return;
    const response = await pddAuthFetch(
      `/rest/v1/pdd_end_user_prospects?id=eq.${encodeURIComponent(prospect.id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          status,
          updated_at: new Date().toISOString(),
          last_contacted_at:
            status === "contacted"
              ? new Date().toISOString()
              : prospect.last_contacted_at,
        }),
      },
    );
    if (!response.ok) {
      setMessage("The prospect status could not be updated.");
      return;
    }
    const rows = (await response.json()) as Prospect[];
    setProspects((current) =>
      current.map((item) =>
        item.id === prospect.id ? rows[0] || { ...item, status } : item,
      ),
    );
    setMessage(`${prospect.company_name} is now ${pretty(status)}.`);
  }
  async function deleteProspect(prospect: Prospect) {
    if (!session || profile?.role !== "administrator" || deletingId) return;
    const name = prospect.company_name || "this prospect";
    if (
      !window.confirm(
        `Delete prospect “${name}”?\n\nThis permanently removes the prospect record and cannot be undone.`,
      )
    )
      return;
    setDeletingId(prospect.id);
    setMessage("");
    try {
      const response = await pddAuthFetch(
        `/rest/v1/pdd_end_user_prospects?id=eq.${encodeURIComponent(prospect.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Prefer: "return=representation",
          },
        },
      );
      if (!response.ok)
        throw new Error(
          await responseErrorMessage(
            response,
            "The prospect could not be deleted",
          ),
        );
      const removed = (await response.json()) as Prospect[];
      if (!removed.some((item) => item.id === prospect.id))
        throw new Error("Only an administrator can delete prospects.");
      setProspects((current) =>
        current.filter((item) => item.id !== prospect.id),
      );
      if (editingId === prospect.id) closeForm();
      setMessage(`${name} was deleted from the prospect directory.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The prospect could not be deleted.",
      );
    } finally {
      setDeletingId("");
    }
  }
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prospects
      .filter(
        (item) =>
          (marketFilter === "all" || item.market === marketFilter) &&
          (statusFilter === "all" || item.status === statusFilter) &&
          (!needle ||
            Object.values(item).some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(needle),
            )),
      )
      .sort((a, b) =>
        a.company_name.localeCompare(b.company_name, undefined, {
          sensitivity: "base",
        }),
      );
  }, [prospects, query, marketFilter, statusFilter]);
  const prospectDownloadRows = useMemo(
    () =>
      prospects.map((prospect) => ({
        ...prospect,
        company: prospect.company_name,
      })),
    [prospects],
  );
  const due = prospects.filter(
    (item) =>
      item.follow_up_date &&
      item.follow_up_date <= new Date().toISOString().slice(0, 10) &&
      !["customer", "not_a_fit"].includes(item.status),
  ).length;
  if (loading)
    return (
      <main className="prospectDirectoryPage">
        <p>Loading the prospect directory…</p>
      </main>
    );
  return (
    <main className="prospectDirectoryPage">
      <header>
        <div>
          <p className="eyebrow">BUSINESS DEVELOPMENT</p>
          <h1>{directoryType === "oem" ? "OEM Prospect Directory" : directoryType === "broker" ? "Broker Prospect Directory" : directoryType === "international" ? "International Prospect Directory" : "End User Prospect Directory"}</h1>
          <p>
            {directoryType === "oem"
              ? "OEM prospecting records with the complete company, contact, qualification and follow-up field set."
              : directoryType === "broker"
                ? "Broker prospecting records with the complete company, contact, qualification and follow-up field set."
                : directoryType === "international"
                  ? "International prospecting records with the complete company, contact, qualification and follow-up field set."
              : "Prospecting records kept separate from bid customers and order customers."}
          </p>
        </div>
        <nav>
          <a href="/employee">← Deal Workbook</a>
          <a href="/employee/end-user-customers">End User Prospects</a>
          <a href="/employee/end-user-customers?type=broker">Broker Prospects</a>
          <a href="/employee/end-user-customers?type=international">International Prospects</a>
          <a href="/employee/end-user-customers?type=oem">OEM Prospects</a>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void addNewProspect()}
          >
            + Add New Prospect
          </button>
          {showForm && (
            <button className="button" type="button" onClick={closeForm}>
              Close Entry Form
            </button>
          )}
        </nav>
      </header>
      <DirectorySpreadsheetImport kind="prospect" label={`${directoryType === "oem" ? "OEM" : directoryType === "broker" ? "Broker" : directoryType === "international" ? "International" : "End_User"}_Prospect`} onImport={importProspects} downloadRows={prospectDownloadRows}/>
      <section className="prospectDirectorySummary">
        <article>
          <strong>{prospects.length}</strong>
          <span>Total prospects</span>
        </article>
        <article>
          <strong>
            {prospects.filter((item) => item.application_submitted).length}
          </strong>
          <span>Vendor applications submitted</span>
        </article>
        <article>
          <strong>
            {prospects.filter((item) => item.status === "opportunity").length}
          </strong>
          <span>Opportunities</span>
        </article>
        <article>
          <strong>{due}</strong>
          <span>Follow-ups due</span>
        </article>
      </section>
      {showForm && (
        <form className="prospectEntryForm" onSubmit={submit}>
          <div className="prospectFormHeading">
            <div>
              <p className="eyebrow">
                {editingId ? "EDIT PROSPECT" : "NEW PROSPECT"}
              </p>
              <h2>
                {editingId
                  ? `Update ${draft.company_name}`
                  : "Company and opportunity"}
              </h2>
            </div>
            <span>* Company is required</span>
          </div>
          <div className="prospectFormGrid">
            <label className="requiredEntryField">
              <span>Company <b className="requiredAsterisk" aria-hidden="true">*</b></span>
              <input
                required
                value={draft.company_name}
                onChange={(e) => field("company_name", e.target.value)}
              />
            </label>
            <label>
              Contact name
              <input
                value={draft.contact_name}
                onChange={(e) => field("contact_name", e.target.value)}
              />
            </label>
            <label>
              Job title
              <input
                value={draft.job_title}
                onChange={(e) => field("job_title", e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="text"
                inputMode="email"
                placeholder="name@company.com, second@company.com"
                value={draft.email}
                onChange={(e) => field("email", e.target.value)}
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
              Market
              <select
                value={draft.market}
                onChange={(e) => field("market", e.target.value)}
              >
                {markets.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Organization size
              <select
                value={draft.organization_size}
                onChange={(e) => field("organization_size", e.target.value)}
              >
                {["Enterprise", "Large", "Medium", "Small", "Unknown"].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Contractor relationship
              <select
                value={draft.contractor_type}
                onChange={(e) => field("contractor_type", e.target.value)}
              >
                {[
                  "Both",
                  "None",
                  "Prime Contractor",
                  "Subcontractor",
                  "Unknown",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Lead source
              <input
                value={draft.source}
                onChange={(e) => field("source", e.target.value)}
                placeholder="Referral, event, website…"
              />
            </label>
            <label>
              Address
              <input
                value={draft.address1}
                onChange={(e) => field("address1", e.target.value)}
              />
            </label>
            <label>
              Address line 2
              <input
                value={draft.address2}
                onChange={(e) => field("address2", e.target.value)}
              />
            </label>
            <label>
              ZIP / Postal code
              <input
                value={draft.postal_code}
                onChange={(e) => field("postal_code", e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => field("status", e.target.value)}
              >
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {pretty(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={draft.priority}
                onChange={(e) => field("priority", e.target.value)}
              >
                <option value="high">High</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
              </select>
            </label>
            <label>
              Assigned employee
              <select
                value={draft.assigned_employee_email}
                onChange={(e) =>
                  field("assigned_employee_email", e.target.value)
                }
              >
                <option value="">Unassigned</option>
                {employees.map((item) => (
                  <option key={item.email} value={item.email}>
                    {item.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Next follow-up
              <input
                type="date"
                value={draft.follow_up_date}
                onChange={(e) => field("follow_up_date", e.target.value)}
              />
            </label>
            <label className="prospectNotes">
              Opportunity notes
              <textarea
                rows={3}
                value={draft.opportunity_notes}
                onChange={(e) => field("opportunity_notes", e.target.value)}
                placeholder="Needs, equipment interests, relationship history and next action…"
              />
            </label>
          </div>
          <section className="prospectVendorDetails">
            <h3>Spreadsheet prospect fields</h3>
            <div className="prospectFormGrid">
              <label>
                Operating locations
                <input
                  value={draft.locations}
                  onChange={(e) => field("locations", e.target.value)}
                />
              </label>
              <label>
                Organization role
                <input
                  value={draft.organization_role}
                  onChange={(e) => field("organization_role", e.target.value)}
                  placeholder="Prime, OEM, university…"
                />
              </label>
              <label>
                Business / government focus
                <input
                  value={draft.business_focus}
                  onChange={(e) => field("business_focus", e.target.value)}
                />
              </label>
              <label>
                IT product fit
                <input
                  value={draft.product_fit}
                  onChange={(e) => field("product_fit", e.target.value)}
                />
              </label>
              <label className="prospectWide">
                Best product angles
                <textarea
                  rows={2}
                  value={draft.product_angles}
                  onChange={(e) => field("product_angles", e.target.value)}
                />
              </label>
              <label>
                Supplier application URL
                <input
                  type="url"
                  value={draft.supplier_url}
                  onChange={(e) => field("supplier_url", e.target.value)}
                />
                {draft.supplier_url && (
                  <a
                    className="prospectUrlPreview"
                    href={websiteHref(draft.supplier_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open supplier website ↗
                  </a>
                )}
              </label>
              <label>
                Secondary source URL
                <input
                  type="url"
                  value={draft.secondary_source_url}
                  onChange={(e) =>
                    field("secondary_source_url", e.target.value)
                  }
                />
                {draft.secondary_source_url && (
                  <a
                    className="prospectUrlPreview"
                    href={websiteHref(draft.secondary_source_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open secondary website ↗
                  </a>
                )}
              </label>
              <label className="prospectWide">
                Application requirements
                <textarea
                  rows={2}
                  value={draft.supplier_requirements}
                  onChange={(e) =>
                    field("supplier_requirements", e.target.value)
                  }
                />
              </label>
              <label className="prospectWide">
                Requirements / watchouts
                <textarea
                  rows={2}
                  value={draft.supplier_watchouts}
                  onChange={(e) => field("supplier_watchouts", e.target.value)}
                />
              </label>
              <label className="prospectWide">
                Recommended next move
                <textarea
                  rows={2}
                  value={draft.recommended_next_move}
                  onChange={(e) =>
                    field("recommended_next_move", e.target.value)
                  }
                />
              </label>
              <label>
                Application status
                <select
                  value={draft.application_status}
                  onChange={(e) => field("application_status", e.target.value)}
                >
                  <option value="approved">Approved</option>
                  <option value="not_available">Not Available</option>
                  <option value="not_started">Not Started</option>
                  <option value="rejected">Rejected</option>
                  <option value="registered">Registered</option>
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under Review</option>
                </select>
              </label>
              <label>
                Submitted date
                <input
                  type="date"
                  value={draft.application_submitted_date}
                  onChange={(e) =>
                    field("application_submitted_date", e.target.value)
                  }
                />
              </label>
              <label className="prospectCheck">
                <input
                  type="checkbox"
                  checked={draft.application_submitted}
                  onChange={(e) =>
                    field("application_submitted", e.target.checked)
                  }
                />{" "}
                Vendor application submitted
              </label>
              <label className="prospectCheck">
                <input
                  type="checkbox"
                  checked={draft.sell_to_prospect}
                  onChange={(e) => field("sell_to_prospect", e.target.checked)}
                />{" "}
                Sell equipment to them
              </label>
              <label className="prospectCheck">
                <input
                  type="checkbox"
                  checked={draft.buy_from_prospect}
                  onChange={(e) => field("buy_from_prospect", e.target.checked)}
                />{" "}
                Buy surplus equipment
              </label>
              <label className="prospectCheck">
                <input
                  type="checkbox"
                  checked={draft.trade_in_candidate}
                  onChange={(e) =>
                    field("trade_in_candidate", e.target.checked)
                  }
                />{" "}
                Offer trade-ins / ITAD
              </label>
            </div>
          </section>
          <div className="prospectFormActions">
            {editingId && (
              <button
                type="button"
                className="button duplicateProspectButton"
                onClick={duplicateProspect}
              >
                Duplicate
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={
                editingId
                  ? closeForm
                  : () =>
                      setDraft({
                        ...blank,
                        assigned_employee_email: profile?.email || "",
                      })
              }
            >
              {editingId ? "Cancel Edit" : "Clear"}
            </button>
            <button
              className="button"
              disabled={busy || !draft.company_name.trim()}
            >
              {busy
                ? "Saving…"
                : editingId
                  ? "Update Prospect"
                  : "Save Prospect"}
            </button>
            {editingId && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void editNextProspect()}
              >
                Next Prospect →
              </button>
            )}
          </div>
        </form>
      )}
      {message && (
        <p className="prospectMessage" role="status">
          {message}
        </p>
      )}
      <section className="prospectDirectoryTools">
        <label>
          Search prospects
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Company, contact, location or notes"
          />
        </label>
        <label>
          Market
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
          >
            <option value="all">All markets</option>
            {markets.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {pretty(item)}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="prospectDirectoryList" id="prospect-pipeline">
        <div className="prospectListHeading">
          <h2>Prospect pipeline</h2>
          <span>{visible.length} shown</span>
        </div>
        {visible.map((item) => (
          <article
            className={item.application_submitted ? "applicationSubmitted" : ""}
            key={item.id}
          >
            <div className="prospectIdentity">
              <span>
                {item.market}
                {item.application_submitted
                  ? " · VENDOR APPLICATION SUBMITTED"
                  : ""}
              </span>
              <h3>{item.company_name}</h3>
              <p>
                {item.contact_name ||
                  item.organization_role ||
                  "No contact yet"}
                {item.job_title ? ` · ${item.job_title}` : ""}
              </p>
              <small>
                {item.locations ||
                  [item.city, item.region, item.country]
                    .filter(Boolean)
                    .join(", ") ||
                  "No location entered"}
              </small>
            </div>
            <div className="prospectAssignment">
              <b>{item.assigned_employee_name || "Unassigned"}</b>
              <small>Assigned employee</small>
              <b className={`priority ${item.priority}`}>
                {pretty(item.priority)} priority
              </b>
            </div>
            <div className="prospectFollowUp">
              <b>
                {item.follow_up_date
                  ? new Date(
                      `${item.follow_up_date}T12:00:00`,
                    ).toLocaleDateString()
                  : "Not scheduled"}
              </b>
              <small>Next follow-up</small>
              {item.email && <a href={`mailto:${item.email}`}>{item.email}</a>}
              {item.phone && <a href={`tel:${item.phone}`}>{item.phone}</a>}
            </div>
            <div className="prospectStatus">
              <select
                aria-label={`Status for ${item.company_name}`}
                value={item.status}
                onChange={(e) => void updateStatus(item, e.target.value)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {pretty(status)}
                  </option>
                ))}
              </select>
              <button
                className="button secondary"
                type="button"
                onClick={() => editProspect(item)}
              >
                Edit
              </button>
              {profile?.role === "administrator" && (
                <button
                  className="button dangerButton"
                  type="button"
                  disabled={Boolean(deletingId)}
                  onClick={() => void deleteProspect(item)}
                >
                  {deletingId === item.id ? "Deleting…" : "Delete"}
                </button>
              )}
              {item.website && (
                <a
                  href={websiteHref(item.website)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Website ↗
                </a>
              )}
            </div>
            <dl className="prospectRecordDetails">
              <div>
                <dt>Operating locations</dt>
                <dd>
                  <LinkedValue text={item.locations} />
                </dd>
              </div>
              <div>
                <dt>Organization role</dt>
                <dd>
                  <LinkedValue text={item.organization_role} />
                </dd>
              </div>
              <div>
                <dt>Business / government focus</dt>
                <dd>
                  <LinkedValue text={item.business_focus} />
                </dd>
              </div>
              <div>
                <dt>IT product fit</dt>
                <dd>
                  <LinkedValue text={item.product_fit} />
                </dd>
              </div>
              <div>
                <dt>Best product angles</dt>
                <dd>
                  <LinkedValue text={item.product_angles} />
                </dd>
              </div>
              <div>
                <dt>Supplier application URL</dt>
                <dd>
                  <LinkedValue text={item.supplier_url} />
                </dd>
              </div>
              <div>
                <dt>Secondary source URL</dt>
                <dd>
                  <LinkedValue text={item.secondary_source_url} />
                </dd>
              </div>
              <div>
                <dt>Application requirements</dt>
                <dd>
                  <LinkedValue text={item.supplier_requirements} />
                </dd>
              </div>
              <div>
                <dt>Requirements / watchouts</dt>
                <dd>
                  <LinkedValue text={item.supplier_watchouts} />
                </dd>
              </div>
              <div>
                <dt>Recommended next move</dt>
                <dd>
                  <LinkedValue text={item.recommended_next_move} />
                </dd>
              </div>
              <div>
                <dt>Application status</dt>
                <dd>{pretty(item.application_status || "not_started")}</dd>
              </div>
              <div>
                <dt>Application submitted</dt>
                <dd>
                  {item.application_submitted ? "Yes" : "No"}
                  {item.application_submitted_date
                    ? ` · ${new Date(`${item.application_submitted_date}T12:00:00`).toLocaleDateString()}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Relationship goals</dt>
                <dd>
                  {[
                    item.sell_to_prospect && "Sell",
                    item.buy_from_prospect && "Buy surplus",
                    item.trade_in_candidate && "Trade-ins / ITAD",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt>Opportunity notes</dt>
                <dd>
                  <LinkedValue text={item.opportunity_notes} />
                </dd>
              </div>
              <div>
                <dt>Lead source</dt>
                <dd>
                  <LinkedValue text={item.source} />
                </dd>
              </div>
              <div>
                <dt>Organization size</dt>
                <dd>{item.organization_size || "—"}</dd>
              </div>
            </dl>
            <CompanyContacts recordType="prospect" recordId={item.id} session={session} initialContact={{contactName:item.contact_name,jobTitle:item.job_title,email:item.email,phone:item.phone,isPrimary:true}} initialAddress={{billingAddress1:item.address1,billingAddress2:item.address2,billingCity:item.city,billingRegion:item.region,billingPostalCode:item.postal_code,billingCountry:item.country,shippingSameAsBilling:true}}/>
            <BusinessRecordComments recordType="prospect" recordId={item.id} session={session}/>
            <BusinessRecordAttachments recordType="prospect" recordId={item.id} recordName={item.company_name} session={session} isAdministrator={profile?.role==="administrator"}/>
          </article>
        ))}
        {!visible.length && (
          <div className="prospectDirectoryEmpty">
            <span>END USER DIRECTORY</span>
            <h2>
              {prospects.length
                ? "No prospects match these filters"
                : "Ready for your first prospect"}
            </h2>
            <p>
              {prospects.length
                ? "Change the search or filters to see more records."
                : "Use New Prospect above. Your future spreadsheet upload will feed this same separate directory."}
            </p>
          </div>
        )}
      </section>
      <nav
        className="prospectScrollControls"
        aria-label="Prospect page navigation"
      >
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
        >
          ↑<span>Top</span>
        </button>
        <button
          type="button"
          onClick={() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: "smooth",
            })
          }
          aria-label="Scroll to bottom"
        >
          ↓<span>Bottom</span>
        </button>
      </nav>
    </main>
  );
}
