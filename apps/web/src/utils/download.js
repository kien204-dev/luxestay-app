import api from "../services/api";

// Downloads a file from an API endpoint that needs the session cookie (so a
// plain <a href> will not do): fetches it as a blob, hands it to the browser
// under the name the server suggested, then releases the blob.
export async function downloadFromApi(path, { params, fallbackName = "download" } = {}) {
  try {
    const response = await api.get(path, { params, responseType: "blob", timeout: 60000 });

    const disposition = response.headers["content-disposition"] || "";
    const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] || fallbackName;

    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    // With responseType "blob" an error body arrives as a Blob too; turn it
    // back into JSON so callers can read err.response.data.message as usual.
    if (err.response?.data instanceof Blob && err.response.data.type?.includes("json")) {
      try {
        err.response.data = JSON.parse(await err.response.data.text());
      } catch {
        // Not JSON after all: leave the error as it is.
      }
    }
    throw err;
  }
}
