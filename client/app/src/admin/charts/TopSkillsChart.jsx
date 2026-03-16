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
import { downloadCSV, downloadJSON, toQuery } from "./chartUtils";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function TopSkillsChart({ timeRange, filters, onDrilldown }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const query = toQuery({
          from: timeRange?.from,
          to: timeRange?.to,
          limit: filters?.limit || 15,
        });
        const response = await fetch(`http://localhost:8000/api/admin/stats/top-skills/?${query}`, {
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Không thể tải top skills");
        }

        if (!ignore) {
          setRows(data.data || []);
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
  }, [timeRange?.from, timeRange?.to, filters?.limit]);

  const chartData = useMemo(() => {
    return {
      labels: rows.map((item) => item.label),
      datasets: [
        {
          label: "Số lần xuất hiện",
          data: rows.map((item) => item.value),
          backgroundColor: "#0ea5e9",
          borderRadius: 8,
        },
      ],
    };
  }, [rows]);

  const options = useMemo(() => ({
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    onClick: (_, points, chart) => {
      if (!points.length || !onDrilldown) return;
      const index = points[0].index;
      onDrilldown({ type: "skill", skill: chart.data.labels[index] });
    },
  }), [onDrilldown]);

  if (loading) return <div className="chart-state">Đang tải Top Skills...</div>;
  if (error) return <div className="chart-state chart-error">{error}</div>;
  if (!rows.length) return <div className="chart-state">Không có dữ liệu kỹ năng.</div>;

  return (
    <section className="chart-card">
      <header className="chart-card-header">
        <h3>Top Skills</h3>
        <div className="chart-actions">
          <button onClick={() => downloadCSV("top-skills.csv", rows)}>CSV</button>
          <button onClick={() => downloadJSON("top-skills.json", rows)}>JSON</button>
        </div>
      </header>
      <div className="chart-canvas-wrap">
        <Bar data={chartData} options={options} />
      </div>
    </section>
  );
}
