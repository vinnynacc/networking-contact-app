import React, { useEffect, useState } from "react";

/**
 * Networking Contact Capture – BONZO-enabled (Preview)
 * - Mobile-first, offline-ready contact capture
 * - Per-contact "Send to BONZO" toggle
 * - Offline queue + manual/auto flush
 * - Local contacts list + integration activity log
 *
 * Note: This canvas preview does not include Tailwind setup; we use utility-like classes.
 * In production, wire Tailwind + Poppins font and swap classNames accordingly.
 */

// ----------------------------------
// Config
// ----------------------------------
const DEFAULT_BONZO_WEBHOOK =
  "https://app.getbonzo.com/api/webhook/b0c3c461189224a84f008aa29054a087";
const QUEUE_KEY = "bonzoQueue:v1";
const CONTACTS_KEY = "contactsStore:v1";
const SETTINGS_KEY = "bonzoSettings:v1";

// ----------------------------------
// Utils
// ----------------------------------
const cx = (...c) => c.filter(Boolean).join(" ");
const nowIso = () => new Date().toISOString();

function normalizePhoneE164(input) {
  if (!input) return "";
  const digits = String(input).replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits; // best-effort fallback
}

function loadLS(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ----------------------------------
// BONZO integration (webhook + queue)
// ----------------------------------
async function sendToBonzo(webhookUrl, payload) {
  if (!webhookUrl) throw new Error("BONZO webhook not configured");
  if (!navigator.onLine) throw new Error("Offline");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function queueBonzoPayload(payload) {
  const q = loadLS(QUEUE_KEY, []);
  q.push({ payload, enqueued_at: nowIso(), tries: 0 });
  saveLS(QUEUE_KEY, q);
}

async function flushBonzoQueue(webhookUrl, onEvent) {
  const q = loadLS(QUEUE_KEY, []);
  if (!q.length || !navigator.onLine || !webhookUrl) return;
  const remaining = [];
  for (const item of q) {
    try {
      await sendToBonzo(webhookUrl, item.payload);
      onEvent?.({ type: "sent", payload: item.payload, at: nowIso() });
    } catch (e) {
      const tries = (item.tries || 0) + 1;
      if (tries < 5) remaining.push({ ...item, tries });
      onEvent?.({ type: "retry", payload: item.payload, at: nowIso(), error: String(e) });
    }
  }
  saveLS(QUEUE_KEY, remaining);
}

function defaultSettings() {
  return {
    webhookUrl: DEFAULT_BONZO_WEBHOOK,
    autoFlushOnOnline: true,
  };
}

// ----------------------------------
// Reusable UI
// ----------------------------------
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-gray-900 mb-1">{label}</div>
      {children}
      {hint && <div className="text-xs text-gray-600 mt-1">{hint}</div>}
    </label>
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-gray-100 text-gray-800",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  };
  return <span className={cx("px-2 py-1 rounded-full text-xs", tones[tone])}>{children}</span>;
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "px-4 py-2 rounded-xl text-sm font-medium",
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900 hover:bg-gray-200"
      )}
    >
      {children}
    </button>
  );
}

// ----------------------------------
// App
// ----------------------------------
export default function App() {
  const [tab, setTab] = useState("add"); // add | contacts | activity | settings
  const [settings, setSettings] = useState(() => loadLS(SETTINGS_KEY, defaultSettings()));
  const [contacts, setContacts] = useState(() => loadLS(CONTACTS_KEY, []));
  const [activity, setActivity] = useState([]);

  useEffect(() => saveLS(SETTINGS_KEY, settings), [settings]);
  useEffect(() => saveLS(CONTACTS_KEY, contacts), [contacts]);

  useEffect(() => {
    const onOnline = () => flushBonzoQueue(settings.webhookUrl, (evt) => logActivity(evt));
    if (settings.autoFlushOnOnline) {
      onOnline();
      window.addEventListener("online", onOnline);
      return () => window.removeEventListener("online", onOnline);
    }
  }, [settings.webhookUrl, settings.autoFlushOnOnline]);

  function logActivity(evt) {
    setActivity((a) => [{ id: Math.random().toString(36).slice(2), ...evt }, ...a].slice(0, 200));
  }

  return (
    <div className="min-h-screen bg-white text-[#1E1E1E]" style={{ fontFamily: "Poppins, ui-sans-serif" }}>
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Networking Contact Capture</h1>
            <p className="text-sm text-gray-600">Mobile-first, offline-ready. Per-contact BONZO send.</p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Pill tone={navigator.onLine ? "green" : "amber"}>{navigator.onLine ? "Online" : "Offline"}</Pill>
            <Pill tone="blue">BONZO</Pill>
          </div>
        </header>

        <nav className="mt-4 flex flex-wrap gap-2">
          <Tab active={tab === "add"} onClick={() => setTab("add")}>Add Contact</Tab>
          <Tab active={tab === "contacts"} onClick={() => setTab("contacts")}>Contacts</Tab>
          <Tab active={tab === "activity"} onClick={() => setTab("activity")}>Integration Activity</Tab>
          <Tab active={tab === "settings"} onClick={() => setTab("settings")}>Settings</Tab>
        </nav>

        <main className="mt-6">
          {tab === "add" && (
            <AddContact
              settings={settings}
              onSaved={(c, integrationEvt) => {
                setContacts((list) => [c, ...list].slice(0, 500));
                if (integrationEvt) logActivity(integrationEvt);
              }}
            />
          )}
          {tab === "contacts" && <ContactsList contacts={contacts} />}
          {tab === "activity" && (
            <ActivityLog
              items={activity}
              onFlush={() => flushBonzoQueue(settings.webhookUrl, (evt) => logActivity(evt))}
            />
          )}
          {tab === "settings" && (
            <SettingsView
              settings={settings}
              onChange={(s) => setSettings(s)}
              onFlush={() => flushBonzoQueue(settings.webhookUrl, (evt) => logActivity(evt))}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ----------------------------------
// Add Contact
// ----------------------------------
function AddContact({ settings, onSaved }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    title: "",
    address: "",
    city: "",
    state: "",
    notes: "",
    nmls: "",
  });
  const [sendToBonzoFlag, setSendToBonzoFlag] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const canSave = form.first_name.trim() && form.last_name.trim();

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setBanner(null);

    const clean = {
      ...form,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: normalizePhoneE164(form.phone),
      company: form.company.trim(),
      title: form.title.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      notes: form.notes.trim(),
      nmls: form.nmls.trim(),
      created_at: nowIso(),
      id: Math.random().toString(36).slice(2),
    };

    // BONZO payload using your exact schema
    const bonzoPayload = {
      first_name: clean.first_name,
      last_name: clean.last_name,
      email: clean.email,
      phone: clean.phone,
      address: clean.address,
      city: clean.city,
      state: clean.state,
      job_title: clean.title,
      company_name: clean.company,
      notes: clean.notes,
      nmls: clean.nmls,
    };

    let integrationEvt = { type: "local", payload: bonzoPayload, at: nowIso() };
    try {
      if (sendToBonzoFlag) {
        try {
          await sendToBonzo(settings.webhookUrl, bonzoPayload);
          integrationEvt = { type: "sent", payload: bonzoPayload, at: nowIso() };
          setBanner({ tone: "green", text: "Saved & sent to BONZO ✅" });
        } catch (err) {
          queueBonzoPayload(bonzoPayload);
          integrationEvt = { type: "queued", payload: bonzoPayload, at: nowIso(), error: String(err) };
          setBanner({ tone: "amber", text: "Saved locally. BONZO send queued (offline or temporary error)." });
        }
      } else {
        setBanner({ tone: "blue", text: "Saved locally (not sent to BONZO)." });
      }

      onSaved?.(clean, integrationEvt);
      setForm({
        first_name: "", last_name: "", email: "", phone: "", company: "",
        title: "", address: "", city: "", state: "", notes: "", nmls: "",
      });
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {banner && (
        <div className={cx(
          "rounded-xl p-3 text-sm",
          banner.tone === "green" && "bg-green-50 text-green-800",
          banner.tone === "amber" && "bg-amber-50 text-amber-800",
          banner.tone === "blue" && "bg-blue-50 text-blue-800"
        )}>{banner.text}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First name">
          <input autoFocus required className="w-full border rounded-xl px-3 py-2"
            value={form.first_name} onChange={(e) => update("first_name", e.target.value)} placeholder="Jordan" />
        </Field>
        <Field label="Last name">
          <input required className="w-full border rounded-xl px-3 py-2"
            value={form.last_name} onChange={(e) => update("last_name", e.target.value)} placeholder="Beck" />
        </Field>
        <Field label="Email">
          <input type="email" className="w-full border rounded-xl px-3 py-2"
            value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="jordan@example.com" />
        </Field>
        <Field label="Phone">
          <input className="w-full border rounded-xl px-3 py-2"
            value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(412) 555‑1234" />
        </Field>
        <Field label="Company">
          <input className="w-full border rounded-xl px-3 py-2"
            value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Summit Mortgage" />
        </Field>
        <Field label="Title">
          <input className="w-full border rounded-xl px-3 py-2"
            value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Loan Officer" />
        </Field>
        <Field label="Address">
          <input className="w-full border rounded-xl px-3 py-2"
            value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="123 Main St" />
        </Field>
        <Field label="City / State">
          <div className="grid grid-cols-3 gap-2">
            <input className="border rounded-xl px-3 py-2 col-span-2"
              value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Pittsburgh" />
            <input className="border rounded-xl px-3 py-2"
              value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="PA" />
          </div>
        </Field>
        <Field label="NMLS (optional)">
          <input className="w-full border rounded-xl px-3 py-2"
            value={form.nmls} onChange={(e) => update("nmls", e.target.value)} placeholder="123456" />
        </Field>
        <Field label="Notes">
          <textarea rows={3} className="w-full border rounded-xl px-3 py-2"
            value={form.notes} onChange={(e) => update("notes", e.target.value)}
            placeholder="Met at booth 214; interested in hybrid model; follow up next week." />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border p-3">
        <div>
          <div className="font-semibold">Send to BONZO</div>
          <div className="text-sm text-gray-600">Push this contact to BONZO when saving.</div>
        </div>
        <button type="button" onClick={() => setSendToBonzoFlag((v) => !v)}
          className={cx("w-14 h-8 rounded-full relative transition-colors", sendToBonzoFlag ? "bg-[#0058A9]" : "bg-gray-300")}
          aria-pressed={sendToBonzoFlag}
        >
          <span className={cx(
            "absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
            sendToBonzoFlag ? "translate-x-6" : "translate-x-0"
          )} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button disabled={!canSave || saving}
          className={cx("px-4 py-2 rounded-xl text-white", canSave && !saving ? "bg-[#0058A9] hover:opacity-90" : "bg-gray-400")}
        >
          {saving ? "Saving…" : "Save + Add Another"}
        </button>
      </div>
    </form>
  );
}

// ----------------------------------
// Contacts List
// ----------------------------------
function ContactsList({ contacts }) {
  if (!contacts.length) {
    return (
      <div className="p-6 rounded-2xl border text-center text-gray-600">
        No contacts yet. Add your first one on the <strong>Add Contact</strong> tab.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contacts.map((c) => (
        <div key={c.id} className="rounded-2xl border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-lg">{c.first_name} {c.last_name}</div>
            <Pill tone="blue">{c.company || "—"}</Pill>
          </div>
          <div className="text-sm text-gray-700 space-y-1">
            {c.title && <div>{c.title}</div>}
            {c.email && <div>Email: {c.email}</div>}
            {c.phone && <div>Phone: {c.phone}</div>}
            {(c.city || c.state) && <div>{[c.city, c.state].filter(Boolean).join(", ")}</div>}
          </div>
          {c.notes && <div className="text-sm text-gray-600">Notes: {c.notes}</div>}
          <div className="text-xs text-gray-500">Added: {new Date(c.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------
// Integration Activity
// ----------------------------------
function ActivityLog({ items, onFlush }) {
  const queue = loadLS(QUEUE_KEY, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">Queue: <strong>{queue.length}</strong> pending</div>
        <button onClick={onFlush} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm">Flush Queue</button>
      </div>
      {!items.length ? (
        <div className="p-6 rounded-2xl border text-center text-gray-600">No integration activity yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">{it.type.toUpperCase()}</div>
                <div className="text-gray-500">{new Date(it.at).toLocaleString()}</div>
              </div>
              {it.error && <div className="text-red-700">{it.error}</div>}
              <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(it.payload, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------
// Settings
// ----------------------------------
function SettingsView({ settings, onChange, onFlush }) {
  const [local, setLocal] = useState(settings);
  const [status, setStatus] = useState("");
  useEffect(() => setLocal(settings), [settings]);

  async function testWebhook() {
    setStatus("Testing…");
    try {
      await fetch(local.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, timestamp: nowIso() }),
      });
      setStatus("Test sent! Check BONZO.");
    } catch (e) {
      setStatus("Test failed (CORS likely in preview). Use a serverless proxy in production if required.");
    }
  }

  function saveSettings() {
    onChange(local);
    setStatus("Settings saved.");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 space-y-3">
        <Field label="BONZO Webhook URL" hint="If you see CORS in production, route through a secure serverless proxy.">
          <input
            className="w-full border rounded-xl px-3 py-2"
            value={local.webhookUrl}
            onChange={(e) => setLocal({ ...local, webhookUrl: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={local.autoFlushOnOnline}
            onChange={(e) => setLocal({ ...local, autoFlushOnOnline: e.target.checked })}
          />
          Auto-flush queue when back online
        </label>
        <div className="flex items-center gap-2">
          <button onClick={saveSettings} className="px-3 py-2 rounded-xl bg-[#0058A9] text-white text-sm">Save</button>
          <button onClick={testWebhook} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm">Send Test</button>
          <button onClick={onFlush} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm">Flush Queue</button>
        </div>
        {status && <div className="text-sm text-gray-700">{status}</div>}
      </div>

      <div className="rounded-2xl border p-4">
        <h3 className="font-semibold mb-2">App → BONZO Field Mapping</h3>
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">{`{
  first_name, last_name, email, phone (E.164),
  address, city, state,
  job_title: title,
  company_name: company,
  notes, nmls
}`}</pre>
        <p className="text-xs text-gray-600 mt-2">Unknown keys are typically ignored by BONZO.</p>
      </div>
    </div>
  );
}
