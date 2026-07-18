const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ponytail: fuzzy match on name+pincode undercounts repeats on spelling
// variance (no phone number available from Meesho to key on instead) —
// accepted for v1, revisit if scam-tagging false negatives become a problem.
export function customerKey(name, pincode) {
  return `${norm(name)}_${norm(pincode)}`;
}
