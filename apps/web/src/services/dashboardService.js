import api from "./api";

export const getDashboardStats = async (range) => {
  const response = await api.get("/dashboard/stats", { params: { range } });
  return response.data;
};

export const getDashboardAnalytics = async (range) => {
  const response = await api.get("/dashboard/analytics", { params: { range } });
  return response.data;
};

// The dashboard for a window of days: { days } (the last N days at the
// property) or { from, to } ("YYYY-MM-DD", both included).
export const getDashboardOverview = async (params) => {
  const response = await api.get("/dashboard/overview", { params });
  return response.data;
};

// Downloads the report as a real browser file save (not just returning the
// bytes) — triggers via a temporary <a download> link, then revokes the
// blob URL once the download has started.
// `range` is one of the old named ranges, or { from, to }.
export const exportDashboardReport = async (range, format) => {
  try {
    const response = await api.get("/dashboard/export", {
      params: typeof range === "string" ? { range, format } : { ...range, format },
      responseType: "blob",
    });

    const contentDisposition = response.headers["content-disposition"] || "";
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || `luxestay-dashboard.${format}`;

    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    // With responseType "blob", axios also delivers error response bodies
    // as a Blob — err.response.data.message isn't readable as-is, so
    // unwrap it back into JSON for callers to read normally.
    if (err.response?.data instanceof Blob && err.response.data.type?.includes("json")) {
      const text = await err.response.data.text();
      try {
        err.response.data = JSON.parse(text);
      } catch {
        // Not actually JSON — leave the error as-is.
      }
    }
    throw err;
  }
};
