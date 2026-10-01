import { createContext, useContext } from "react";

export const AdminTokenContext = createContext("");

export function useAdminToken() {
  return useContext(AdminTokenContext);
}
