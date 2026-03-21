const truthyValues = new Set(["1", "true", "yes", "on"]);

export function isHackathonModeEnabled(value = process.env.HACKATHON_MODE) {
  if (!value) {
    return false;
  }

  return truthyValues.has(value.trim().toLowerCase());
}
