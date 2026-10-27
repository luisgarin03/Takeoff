import React, { createContext, useContext } from "react";

const FULL_ACCESS = Object.freeze({ readOnly: false, reason: "", message: "", subscription: null, session: null });
const LicenseAccessContext = createContext(FULL_ACCESS);

export function LicenseAccessProvider({ value, children }) {
  return <LicenseAccessContext.Provider value={value || FULL_ACCESS}>{children}</LicenseAccessContext.Provider>;
}

export function useLicenseAccess() {
  return useContext(LicenseAccessContext) || FULL_ACCESS;
}

export { FULL_ACCESS };
