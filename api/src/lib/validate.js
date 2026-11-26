// Validation for a HACK-A-THON 2.0 registration. Returns { value, errors }.
const YEARS = ["1st", "2nd", "3rd", "4th"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function validateRegistration(input) {
  const errors = [];
  const d = input && typeof input === "object" ? input : {};

  const teamName = clean(d.teamName, 60);
  if (teamName.length < 3) errors.push("Team name must be at least 3 characters.");

  const teamSize = Number(d.teamSize);
  if (![3, 4, 5].includes(teamSize)) errors.push("Team size must be 3, 4 or 5.");

  const raw = Array.isArray(d.members) ? d.members : [];
  if (raw.length !== teamSize) errors.push("Add details for every team member.");

  const members = raw.slice(0, 5).map((m, i) => {
    const who = i === 0 ? "Team leader" : `Member ${i + 1}`;
    const name = clean(m?.name, 80);
    const email = clean(m?.email, 120).toLowerCase();
    const year = clean(m?.year, 4);
    const college = clean(m?.college, 140);
    if (name.length < 2) errors.push(`${who}: enter a full name.`);
    if (!EMAIL.test(email)) errors.push(`${who}: enter a valid email address.`);
    if (!YEARS.includes(year)) errors.push(`${who}: choose the year of study.`);
    if (college.length < 2) errors.push(`${who}: enter the college name.`);
    return { role: i === 0 ? "leader" : "member", name, email, year, college };
  });

  const emails = members.map(m => m.email).filter(Boolean);
  if (new Set(emails).size !== emails.length) errors.push("Each member needs a different email address.");

  const ideaTitle = clean(d.ideaTitle, 150);
  if (ideaTitle.length < 5) errors.push("Idea title must be at least 5 characters.");

  return { errors, value: { teamName, teamSize, members, ideaTitle } };
}

module.exports = { validateRegistration, YEARS };
