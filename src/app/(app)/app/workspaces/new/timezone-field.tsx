"use client";

import * as React from "react";
import { TimezoneCombobox } from "@/components/forms/timezone-combobox";

export function WorkspaceTimezoneField() {
  const [timezone, setTimezone] = React.useState("UTC");
  return (
    <TimezoneCombobox
      id="timezone"
      name="timezone"
      value={timezone}
      onChange={setTimezone}
      required
    />
  );
}
