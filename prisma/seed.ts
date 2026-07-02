import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// The 18 Local Government Areas of Ondo State.
const ONDO_LGAS = [
  "Akoko North-East",
  "Akoko North-West",
  "Akoko South-East",
  "Akoko South-West",
  "Akure North",
  "Akure South",
  "Ese-Odo",
  "Idanre",
  "Ifedore",
  "Ilaje",
  "Ile-Oluji/Okeigbo",
  "Irele",
  "Odigbo",
  "Okitipupa",
  "Ondo East",
  "Ondo West",
  "Ose",
  "Owo",
];

// Contesting parties. Candidate names are set for the two leading parties;
// the rest are placeholders you can edit in the admin console.
const PARTIES = [
  { code: "APC", name: "All Progressives Congress", color: "#1f6feb", candidate: "Lucky Aiyedatiwa", mate: "Olayide Adelami" },
  { code: "PDP", name: "Peoples Democratic Party", color: "#137a37", candidate: "Agboola Ajayi", mate: null },
  { code: "LP", name: "Labour Party", color: "#b26a00", candidate: "LP candidate (set in admin)", mate: null },
  { code: "NNPP", name: "New Nigeria Peoples Party", color: "#7b2fbf", candidate: "NNPP candidate (set in admin)", mate: null },
  { code: "SDP", name: "Social Democratic Party", color: "#0b7285", candidate: "SDP candidate (set in admin)", mate: null },
  { code: "ZLP", name: "Zenith Labour Party", color: "#c2255c", candidate: "ZLP candidate (set in admin)", mate: null },
  { code: "APGA", name: "All Progressives Grand Alliance", color: "#2f9e44", candidate: "APGA candidate (set in admin)", mate: null },
  { code: "ADC", name: "African Democratic Congress", color: "#495057", candidate: "ADC candidate (set in admin)", mate: null },
];

async function main() {
  const election = await db.election.create({
    data: {
      name: "Ondo State Governorship Election",
      type: "GOVERNORSHIP",
      date: new Date("2024-11-16T07:00:00+01:00"),
      status: "LIVE",
    },
  });

  const parties = await Promise.all(
    PARTIES.map((p) =>
      db.party.create({ data: { electionId: election.id, code: p.code, name: p.name, color: p.color } })
    )
  );
  await Promise.all(
    PARTIES.map((p) => {
      const party = parties.find((x) => x.code === p.code)!;
      return db.candidate.create({
        data: { electionId: election.id, partyId: party.id, name: p.candidate, runningMate: p.mate },
      });
    })
  );

  const state = await db.state.create({ data: { code: "ON", name: "Ondo" } });

  // Seed all 18 LGAs with 2 sample wards and 3 sample polling units each.
  // (Full INEC geography — 203 wards / ~3,933 PUs — is imported via admin.)
  const pollingUnits: { id: string; name: string }[] = [];
  for (const [li, lname] of ONDO_LGAS.entries()) {
    const lga = await db.lga.create({
      data: { stateId: state.id, code: `L${String(li + 1).padStart(2, "0")}`, name: lname },
    });
    for (let w = 1; w <= 2; w++) {
      const ward = await db.ward.create({
        data: { lgaId: lga.id, code: `W${w}`, name: `${lname} Ward ${w}` },
      });
      for (let u = 1; u <= 3; u++) {
        const pu = await db.pollingUnit.create({
          data: {
            wardId: ward.id,
            lgaId: lga.id,
            stateId: state.id,
            code: `PU${w}${u}`,
            name: `${lname} W${w} Unit ${u}`,
            registeredVoters: 400 + Math.floor(Math.random() * 500),
            lat: 6.9 + Math.random() * 0.9,
            lng: 4.7 + Math.random() * 1.1,
          },
        });
        pollingUnits.push({ id: pu.id, name: pu.name });
      }
    }
  }

  // Staff logins for the situation room.
  await db.user.create({
    data: { email: "analyst@situationroom.local", name: "Situation Room Analyst", role: "ANALYST", passwordHash: await bcrypt.hash("changeme", 10) },
  });
  await db.user.create({
    data: { email: "admin@situationroom.local", name: "Administrator", role: "ADMIN", passwordHash: await bcrypt.hash("changeme", 10) },
  });

  // Two demo field agents (Akure South) with known invite codes.
  const akureSouthUnits = pollingUnits.filter((p) => p.name.startsWith("Akure South"));
  const demoCodes = ["FIELD-1001", "FIELD-1002"];
  for (const [i, code] of demoCodes.entries()) {
    const pu = akureSouthUnits[i] ?? pollingUnits[i];
    await db.agent.create({
      data: {
        electionId: election.id,
        name: `Agent ${i + 1}`,
        phone: `080000000${i + 1}`,
        scope: "PU",
        pollingUnitId: pu.id,
        inviteCode: code,
        status: "INVITED",
      },
    });
  }

  console.log("Seed complete.");
  console.log("  Election:", election.name, "(Governorship)");
  console.log("  Parties:", PARTIES.map((p) => p.code).join(", "));
  console.log("  LGAs:", ONDO_LGAS.length, "· PollingUnits:", pollingUnits.length);
  console.log("  Staff: analyst@situationroom.local / changeme  (also admin@…)");
  console.log("  Agent invite codes:", demoCodes.join(", "), "(set PIN on first login)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
