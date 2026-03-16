import React, { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import { Line } from "react-chartjs-2";
import { downloadCSV, downloadJSON, toQuery } from "./chartUtils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, zoomPlugin);

export default function JobsOverTimeChart({ timeRange, filters, onDrilldown }) {
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
          interval: filters?.interval || "day",
        });
        const response = await fetch(`http://localhost:8000/api/admin/stats/jobs-over-time/?${query}`, {
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Không thể tải dữ liệu jobs over time");
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
  }, [timeRange?.from, timeRange?.to, filters?.interval]);

  const chartData = useMemo(() => {
    return {
      labels: rows.map((item) => item.x),
      datasets: [
        {
          label: "Số lượng công việc",
          data: rows.map((item) => item.y),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.18)",
          fill: true,
          tension: 0.25,
        },
      ],
    };
  }, [rows]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
      },
      tooltip: {
        mode: "index",
        intersect: false,
      },
      zoom: {
        pan: { enabled: true, mode: "x" },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
      },
    },
    onClick: (_, points, chart) => {
      if (!points.length || !onDrilldown) return;
      const index = points[0].index;
      const bucket = chart.data.labels[index];
      onDrilldown({ type: "jobs-over-time", bucket });
    },
    scales: {
      x: { title: { display: true, text: "Thời gian" } },
      y: { beginAtZero: true, title: { display: true, text: "Số jobs" } },
    },
  }), [onDrilldown]);

  if (loading) return <div className="chart-state">Đang tải Jobs Over Time...</div>;
  if (error) return <div className="chart-state chart-error">{error}</div>;
  if (!rows.length) return <div className="chart-state">Không có dữ liệu trong khoảng thời gian đã chọn.</div>;

  return (
    <section className="chart-card">
      <header className="chart-card-header">
        <h3>Jobs Over Time</h3>
        <div className="chart-actions">
          <button onClick={() => downloadCSV("jobs-over-time.csv", rows)}>CSV</button>
          <button onClick={() => downloadJSON("jobs-over-time.json", rows)}>JSON</button>
        </div>
      </header>
      <div className="chart-canvas-wrap">
        <Line data={chartData} options={options} />
      </div>
    </section>
  );
}
