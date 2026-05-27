import React, { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { downloadCSV, downloadJSON, toQuery } from "./chartUtils";

ChartJS.register(ArcElement, Tooltip, Legend);

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

export default function SourceBreakdownChart({ timeRange, onDrilldown }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const query = toQuery({ from: timeRange?.from, to: timeRange?.to });
        const response = await fetch(`/api/admin/stats/source-breakdown/?${query}`, {
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Không thể tải source breakdown");
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
  }, [timeRange?.from, timeRange?.to]);

  const chartData = useMemo(() => ({
    labels: rows.map((item) => item.label),
    datasets: [
      {
        data: rows.map((item) => item.value),
        backgroundColor: rows.map((_, index) => COLORS[index % COLORS.length]),
      },
    ],
  }), [rows]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
    onClick: (_, points, chart) => {
      if (!points.length || !onDrilldown) return;
      const index = points[0].index;
      onDrilldown({ type: "source", source: chart.data.labels[index] });
    },
  }), [onDrilldown]);

  if (loading) return <div className="chart-state">Đang tải Source Breakdown...</div>;
  if (error) return <div className="chart-state chart-error">{error}</div>;
  if (!rows.length) return <div className="chart-state">Không có dữ liệu nguồn.</div>;

  return (
    <section className="chart-card">
      <header className="chart-card-header">
        <h3>Source Breakdown</h3>
        <div className="chart-actions">
          <button onClick={() => downloadCSV("source-breakdown.csv", rows)}>CSV</button>
          <button onClick={() => downloadJSON("source-breakdown.json", rows)}>JSON</button>
        </div>
      </header>
      <div className="chart-canvas-wrap">
        <Doughnut data={chartData} options={options} />
      </div>
    </section>
  );
}
