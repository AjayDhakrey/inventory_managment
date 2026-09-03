import { apiClient } from "./client.js";

export const productImportApi = {
  extract: (file) => {
    const data = new FormData();
    data.append("file", file);
    return apiClient.upload("/product-imports/extract", data);
  },
  confirm: (payload) => apiClient.post("/product-imports/confirm", payload),
  history: () => apiClient.get("/product-imports/history"),
};
