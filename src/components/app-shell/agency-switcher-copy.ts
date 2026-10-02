export type AgencySwitcherCopy = {
  activeAria: string;
  selectAria: string;
  selectAgency: string;
  noAgenciesAria: string;
  noAgency: string;
  switchTitle: string;
  listAria: string;
  noAgenciesYet: string;
  createNew: string;
  adminLabel: string;
  switchNotMember: string;
  sessionExpired: string;
  switchFailed: string;
  switchFailedShort: string;
};

const DEFAULT_COPY: AgencySwitcherCopy = {
  activeAria: "Active agency: {name}. Click to switch.",
  selectAria: "Select an agency. Click to open.",
  selectAgency: "Select agency",
  noAgenciesAria: "No agencies",
  noAgency: "No agency",
  switchTitle: "Switch agency",
  listAria: "Agencies",
  noAgenciesYet: "No agencies yet.",
  createNew: "Create new agency",
  adminLabel: "Agency admin",
  switchNotMember: "You're no longer a member of that agency.",
  sessionExpired: "Your session expired. Please sign in again.",
  switchFailed: "Couldn't switch agencies. Please try again or contact support.",
  switchFailedShort: "Couldn't switch agencies. Please try again.",
};

export function agencySwitcherCopy(labels: Record<string, string>): AgencySwitcherCopy {
  return {
    activeAria: labels["agencySwitcherActiveAria"] ?? DEFAULT_COPY.activeAria,
    selectAria: labels["agencySwitcherSelectAria"] ?? DEFAULT_COPY.selectAria,
    selectAgency: labels["agencySwitcherSelect"] ?? DEFAULT_COPY.selectAgency,
    noAgenciesAria: labels["agencySwitcherNoAgenciesAria"] ?? DEFAULT_COPY.noAgenciesAria,
    noAgency: labels["agencySwitcherNoAgency"] ?? DEFAULT_COPY.noAgency,
    switchTitle: labels["agencySwitcherSwitchTitle"] ?? DEFAULT_COPY.switchTitle,
    listAria: labels["agencySwitcherListAria"] ?? DEFAULT_COPY.listAria,
    noAgenciesYet: labels["agencySwitcherNoAgenciesYet"] ?? DEFAULT_COPY.noAgenciesYet,
    createNew: labels["agencySwitcherCreateNew"] ?? DEFAULT_COPY.createNew,
    adminLabel: labels["agencySwitcherAdminLabel"] ?? DEFAULT_COPY.adminLabel,
    switchNotMember: labels["agencySwitcherSwitchNotMember"] ?? DEFAULT_COPY.switchNotMember,
    sessionExpired: labels["agencySwitcherSessionExpired"] ?? DEFAULT_COPY.sessionExpired,
    switchFailed: labels["agencySwitcherSwitchFailed"] ?? DEFAULT_COPY.switchFailed,
    switchFailedShort: labels["agencySwitcherSwitchFailedShort"] ?? DEFAULT_COPY.switchFailedShort,
  };
}
