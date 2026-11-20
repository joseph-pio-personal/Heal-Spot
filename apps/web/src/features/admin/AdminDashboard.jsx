import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest } from "../../api/client.js";
import DepartmentsPanel from "./DepartmentsPanel.jsx";
import DoctorsPanel from "./DoctorsPanel.jsx";
import OverviewPanel from "./OverviewPanel.jsx";
import StaffPanel from "./StaffPanel.jsx";

const EMPTY_DATA = { departments: [], doctors: [], staff: [] };
const TABS = ["Overview", "Departments", "Doctors", "Staff"];

function AdminDashboard({ currentUser }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const [departmentResult, doctorResult, staffResult] = await Promise.all([
      apiRequest("/api/admin/departments"),
      apiRequest("/api/admin/doctors"),
      apiRequest("/api/auth/admin/staff"),
    ]);
    setData({
      departments: departmentResult.departments,
      doctors: doctorResult.doctors,
      staff: staffResult.staff,
    });
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest("/api/admin/departments"),
      apiRequest("/api/admin/doctors"),
      apiRequest("/api/auth/admin/staff"),
    ])
      .then(([departmentResult, doctorResult, staffResult]) => {
        if (!active) return;
        setData({
          departments: departmentResult.departments,
          doctors: doctorResult.doctors,
          staff: staffResult.staff,
        });
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const runAction = async (action, successMessage) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
      await refresh();
      setNotice(successMessage);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setError("");
    setNotice("");
  };

  return (
    <section className="admin-dashboard" aria-label="Administration dashboard">
      <div className="admin-welcome">
        <div>
          <span className="eyebrow"><ShieldCheck size={13} /> HOSPITAL MANAGEMENT</span>
          <h2>Your hospital, at a glance.</h2>
          <p>Manage the care team, departments, schedules and consultation fees.</p>
        </div>
        <button
          className="admin-refresh"
          disabled={busy || loading}
          onClick={() => runAction(refresh, "Dashboard refreshed.")}
          type="button"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map((tab) => (
          <button
            aria-current={activeTab === tab ? "page" : undefined}
            className={activeTab === tab ? "admin-tab admin-tab-active" : "admin-tab"}
            key={tab}
            onClick={() => selectTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </nav>

      {error && <p className="form-message form-error admin-message" role="alert">{error}</p>}
      {notice && <p className="form-message form-success admin-message" role="status"><Check size={14} /> {notice}</p>}
      {loading ? (
        <div className="admin-loading"><RefreshCw size={18} /> Loading hospital data...</div>
      ) : (
        <>
          <div hidden={activeTab !== "Overview"}>
            <OverviewPanel
              departments={data.departments}
              doctors={data.doctors}
              staff={data.staff}
            />
          </div>
          <div hidden={activeTab !== "Departments"}>
            <DepartmentsPanel
              busy={busy}
              departments={data.departments}
              runAction={runAction}
            />
          </div>
          <div hidden={activeTab !== "Doctors"}>
            <DoctorsPanel
              busy={busy}
              departments={data.departments}
              doctors={data.doctors}
              runAction={runAction}
            />
          </div>
          <div hidden={activeTab !== "Staff"}>
            <StaffPanel
              busy={busy}
              currentUser={currentUser}
              runAction={runAction}
              staff={data.staff}
            />
          </div>
        </>
      )}
    </section>
  );
}

export default AdminDashboard;
