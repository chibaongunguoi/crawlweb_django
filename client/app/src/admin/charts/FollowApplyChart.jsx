import React, { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { downloadJSON, toQuery } from "./chartUtils";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function FollowApplyChart({ filters, onDrilldown }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const query = toQuery({ top: filters?.top || 10 });

        const [followRes, applyRes] = await Promise.all([
          fetch(`/api/admin/stats/follow-counts/?${query}`, { credentials: "include" }),
          fetch(`/api/admin/stats/application-counts/?${query}`, { credentials: "include" }),
        ]);

        const [followData, applyData] = await Promise.all([followRes.json(), applyRes.json()]);

        if (!followRes.ok || !followData.success) {
          throw new Error(followData.error || "Không thể tải follow counts");
        }
        if (!applyRes.ok || !applyData.success) {
          throw new Error(applyData.error || "Không thể tải application counts");
        }

        const followMap = new Map((followData.data || []).map((item) => [String(item.jobId), item]));
        const applyMap = new Map((applyData.data || []).map((item) => [String(item.jobId), item]));

        const mergedIds = Array.from(new Set([...followMap.keys(), ...applyMap.keys()]));
        const merged = mergedIds.map((jobId) => {
          const f = followMap.get(jobId);
          const a = applyMap.get(jobId);
          return {
            jobId,
            title: f?.title || a?.title || "Unknown job",
            company: f?.company || a?.company || "Unknown company",
            followCount: f?.count || 0,
            applyCount: a?.count || 0,
          };
        });

        merged.sort((left, right) => (right.followCount + right.applyCount) - (left.followCount + left.applyCount));

        if (!ignore) {
          setRows(merged.slice(0, filters?.top || 10));
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Lỗi tải dữ liệu");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, [filters?.top]);

  const chartData = useMemo(() => ({
    labels: rows.map((item) => item.title.length > 28 ? `${item.title.slice(0, 28)}...` : item.title),
    datasets: [
      {
        label: "Follow",
        data: rows.map((item) => item.followCount),
        backgroundColor: "#22c55e",
      },
      {
        label: "Apply",
        data: rows.map((item) => item.applyCount),
        backgroundColor: "#f59e0b",
      },
    ],
  }), [rows]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: { mode: "index", intersect: false },
    },
    onClick: (_, points) => {
      if (!points.length || !onDrilldown) return;
      const index = points[0].index;
      onDrilldown({ type: "job", jobId: rows[index].jobId });
    },
    scales: {
      y: { beginAtZero: true },
    },
  }), [onDrilldown, rows]);

  if (loading) return <div className="chart-state">Đang tải Follow/Apply...</div>;
  if (error) return <div className="chart-state chart-error">{error}</div>;
  if (!rows.length) return <div className="chart-state">Không có dữ liệu follow/apply.</div>;

  return (
    <section className="chart-card chart-card-wide">
      <header className="chart-card-header">
        <h3>Follow vs Apply (Top Jobs)</h3>
        <div className="chart-actions">
          <button onClick={() => downloadJSON("follow-apply.json", rows)}>JSON</button>
        </div>
      </header>
      <div className="chart-canvas-wrap">
        <Bar data={chartData} options={options} />
      </div>
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Company</th>
              <th>Follow</th>
              <th>Apply</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((item) => (
              <tr key={item.jobId}>
                <td>{item.title}</td>
                <td>{item.company}</td>
                <td>{item.followCount}</td>
                <td>{item.applyCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
